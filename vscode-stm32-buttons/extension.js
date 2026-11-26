// STM32 Build & Flash buttons — plain JS, no build step.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');

let busy = false;
let buildItem, flashItem, presetItem;

function cfg() {
  return vscode.workspace.getConfiguration('stm32bf');
}

/** Workspace folder that contains CMakePresets.json (or the first folder). */
function projectRoot() {
  const folders = vscode.workspace.workspaceFolders || [];
  for (const f of folders) {
    if (fs.existsSync(path.join(f.uri.fsPath, 'CMakePresets.json'))) return f;
  }
  return folders[0];
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function findProgrammer() {
  const configured = cfg().get('programmerPath');
  if (configured) return configured;

  const exe = process.platform === 'win32' ? 'STM32_Programmer_CLI.exe' : 'STM32_Programmer_CLI';

  // 1) PATH
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, exe);
    if (dir && fs.existsSync(p)) return p;
  }

  // 2) STM32Cube bundles (installed by the STM32 VS Code extension) — newest version
  const bundleRoots = [
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'stm32cube', 'bundles', 'programmer'),
    path.join(os.homedir(), '.stm32cube', 'bundles', 'programmer'),
  ];
  for (const root of bundleRoots) {
    if (!fs.existsSync(root)) continue;
    const versions = fs.readdirSync(root).filter(v => /^\d+(\.\d+)*$/.test(v)).sort(compareVersions).reverse();
    for (const v of versions) {
      const p = path.join(root, v, 'bin', exe);
      if (fs.existsSync(p)) return p;
    }
  }

  // 3) Classic STM32CubeProgrammer install
  const classic = 'C:\\Program Files\\STMicroelectronics\\STM32Cube\\STM32CubeProgrammer\\bin\\' + exe;
  if (fs.existsSync(classic)) return classic;

  return null;
}

/** Run a VS Code task and resolve with its exit code. */
function runTask(name, execution, folder, problemMatchers = []) {
  const task = new vscode.Task({ type: 'stm32bf', name }, folder, name, 'stm32', execution, problemMatchers);
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Shared,
    clear: false,
    showReuseMessage: false,
  };
  return new Promise(async (resolve, reject) => {
    let exec;
    const sub = vscode.tasks.onDidEndTaskProcess(e => {
      if (exec && e.execution === exec) {
        sub.dispose();
        resolve(e.exitCode ?? 1);
      }
    });
    try {
      exec = await vscode.tasks.executeTask(task);
    } catch (err) {
      sub.dispose();
      reject(err);
    }
  });
}

function setBusy(on, label) {
  busy = on;
  buildItem.text = on && label === 'build' ? '$(sync~spin) Building…' : '$(tools) STM32 Build';
  flashItem.text = on && label === 'flash' ? '$(sync~spin) Flashing…' : '$(zap) STM32 Flash';
}

async function doBuild({ clean = false } = {}) {
  const folder = projectRoot();
  if (!folder) {
    vscode.window.showErrorMessage('워크스페이스 폴더가 없습니다.');
    return false;
  }
  await vscode.workspace.saveAll(false);

  const root = folder.uri.fsPath;
  const preset = cfg().get('preset');
  const buildDir = path.join(root, 'build', preset);
  const opts = { cwd: root };

  if (clean && fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }

  if (!fs.existsSync(path.join(buildDir, 'CMakeCache.txt'))) {
    const code = await runTask(`Configure (${preset})`,
      new vscode.ProcessExecution('cmake', ['--preset', preset], opts), folder);
    if (code !== 0) {
      vscode.window.showErrorMessage(`CMake configure 실패 (exit ${code})`);
      return false;
    }
  }

  const code = await runTask(`Build (${preset})`,
    new vscode.ProcessExecution('cmake', ['--build', '--preset', preset], opts), folder, ['$gcc']);
  if (code !== 0) {
    vscode.window.showErrorMessage(`빌드 실패 (exit ${code}) — Problems 탭을 확인하세요.`);
    return false;
  }
  vscode.window.setStatusBarMessage('$(check) 빌드 성공', 4000);
  return true;
}

function findElf(buildDir) {
  if (!fs.existsSync(buildDir)) return null;
  const elfs = fs.readdirSync(buildDir)
    .filter(f => f.toLowerCase().endsWith('.elf'))
    .map(f => path.join(buildDir, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return elfs[0] || null;
}

async function doFlash() {
  if (!(await doBuild())) return;

  const folder = projectRoot();
  const preset = cfg().get('preset');
  const elf = findElf(path.join(folder.uri.fsPath, 'build', preset));
  if (!elf) {
    vscode.window.showErrorMessage(`build/${preset} 에서 .elf 파일을 찾지 못했습니다.`);
    return;
  }

  const programmer = findProgrammer();
  if (!programmer) {
    const pick = await vscode.window.showErrorMessage(
      'STM32_Programmer_CLI 를 찾지 못했습니다. 설정에서 경로를 지정하세요.', '설정 열기');
    if (pick) vscode.commands.executeCommand('workbench.action.openSettings', 'stm32bf.programmerPath');
    return;
  }

  const args = ['-c', ...cfg().get('connectArgs').split(/\s+/).filter(Boolean), '-w', elf];
  if (cfg().get('verify')) args.push('-v');
  args.push('-rst');

  const code = await runTask('Flash', new vscode.ProcessExecution(programmer, args, { cwd: folder.uri.fsPath }), folder);
  if (code === 0) {
    vscode.window.showInformationMessage(`보드에 굽기 완료: ${path.basename(elf)}`);
  } else {
    vscode.window.showErrorMessage(`Flash 실패 (exit ${code}) — 보드 USB 연결 / ST-LINK 드라이버를 확인하세요.`);
  }
}

function guarded(kind, fn) {
  return async (...a) => {
    if (busy) {
      vscode.window.showWarningMessage('이미 작업이 진행 중입니다.');
      return;
    }
    setBusy(true, kind);
    try {
      await fn(...a);
    } catch (err) {
      vscode.window.showErrorMessage(String(err && err.message || err));
    } finally {
      setBusy(false);
    }
  };
}

function updatePresetItem() {
  presetItem.text = `$(gear) ${cfg().get('preset')}`;
}

function activate(context) {
  buildItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  buildItem.command = 'stm32bf.build';
  buildItem.tooltip = 'CMake 빌드 (Ctrl+Alt+B)';

  flashItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  flashItem.command = 'stm32bf.flash';
  flashItem.tooltip = '빌드 후 보드에 굽기 (Ctrl+Alt+F)';

  presetItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
  presetItem.command = 'stm32bf.selectPreset';
  presetItem.tooltip = '빌드 preset 변경';

  setBusy(false);
  updatePresetItem();
  buildItem.show();
  flashItem.show();
  presetItem.show();

  context.subscriptions.push(
    buildItem, flashItem, presetItem,
    vscode.commands.registerCommand('stm32bf.build', guarded('build', () => doBuild())),
    vscode.commands.registerCommand('stm32bf.clean', guarded('build', () => doBuild({ clean: true }))),
    vscode.commands.registerCommand('stm32bf.flash', guarded('flash', doFlash)),
    vscode.commands.registerCommand('stm32bf.selectPreset', async () => {
      let presets = ['Debug', 'Release'];
      try {
        const folder = projectRoot();
        const json = JSON.parse(fs.readFileSync(path.join(folder.uri.fsPath, 'CMakePresets.json'), 'utf8'));
        presets = (json.buildPresets || []).map(p => p.name);
      } catch { /* fall back to defaults */ }
      const pick = await vscode.window.showQuickPick(presets, { placeHolder: '빌드 preset 선택' });
      if (pick) await cfg().update('preset', pick, vscode.ConfigurationTarget.Workspace);
    }),
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('stm32bf.preset')) updatePresetItem();
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
