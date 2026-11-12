# LIG D&A 부트캠프 · Embedded Study

LIG D&A 부트캠프 임베디드 스터디에서 진행한 STM32 **NUCLEO-F446ZE** 실습 모음입니다. (STM32CubeMX + CMake + Ninja + Arm GNU Toolchain)

## 프로젝트

| 폴더 | 내용 | 핵심 |
|---|---|---|
| [pull-up-pull-down](pull-up-pull-down/) | 버튼 입력(PF13)을 읽어 LED(PF12) 제어, 입력값을 시리얼로 출력 | GPIO 입력 / 풀업·풀다운 저항, `printf` → USART3 |
| [UART_OSILO](UART_OSILO/) | USART6(PC6, 9600bps)로 `'A'`를 반복 전송해 오실로스코프로 파형 관찰, 같은 데이터를 비트 단위 문자열로 USART3(115200bps)에 출력 | UART 프레임(Start/Data LSB first/Stop) |

## 빌드

필요한 도구: CMake, Ninja, Arm GNU Toolchain(`arm-none-eabi-gcc`)

```bash
cd UART_OSILO            # 또는 pull-up-pull-down
cmake --preset Debug
cmake --build --preset Debug
# 결과: build/Debug/<프로젝트명>.elf
```

보드에 올리기: VS Code에서 F5(디버그) 또는 STM32CubeProgrammer로 `.elf` 다운로드.

## 시리얼 모니터

ST-LINK USB를 연결하면 **STLink Virtual COM Port**가 생깁니다 (보드의 USART3에 연결됨).

- 포트: STLink Virtual COM Port (장치 관리자에서 COM 번호 확인)
- 설정: **115200bps, 8N1**

## UART_OSILO 오실로스코프 설정 (PC6, 9600bps, 3.3V)

| 항목 | 값 |
|---|---|
| 프로브 | PC6 / GND, ×10 (채널 Probe도 10X) |
| Coupling | DC |
| V/div | 1V |
| Time/div | 100µs (한 글자 ≈ 1.04ms, 1비트 ≈ 104µs) |
| Trigger | Edge, Falling, Level ≈ 1.5V, Normal |

`'A'`(0x41) 기대 파형(왼쪽부터): `0 | 1 0 0 0 0 0 1 0 | 1`  (Start | LSB→MSB | Stop)
