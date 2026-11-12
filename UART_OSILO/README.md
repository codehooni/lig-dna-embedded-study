# UART_OSILO · UART 레지스터 분석

**데이터시트와 레퍼런스 매뉴얼을 읽고, HAL이 실제로 어떤 레지스터에 어떤 값을 쓰는지 직접 확인하는 실습**입니다.

CubeMX에서 USART6을 `9600bps, 8N1, TX=PG14`로 설정합니다. 그다음 문서를 보고 각 레지스터에 들어가야 할 값을 **직접 계산**하고, 디버거로 **실제 값을 읽어 비교**합니다.

- 보드: NUCLEO-F446ZE (STM32F446ZETx)
- 대상: **USART6** (TX = PG14 = Arduino 헤더 D1)
- 비교용: USART3 (PD8/PD9, ST-LINK 가상 COM 포트, 115200bps)

## 참고 문서

| 문서 | 번호 | 이 실습에서 보는 부분 |
|---|---|---|
| STM32F446xx **Reference Manual** | **RM0390** | RCC 레지스터(클럭 enable), GPIO 레지스터(MODER/OSPEEDR/AFR), USART 레지스터(SR/DR/BRR/CR1~3), Baud rate 계산식 |
| STM32F446xC/E **Datasheet** | **DS10693** | 메모리 맵(주변장치 주소), 핀 Alternate function 표(PG14 = AF8 = USART6_TX) |
| NUCLEO-144 **User Manual** | **UM1974** | 보드 헤더 핀 배치(D1 = PG14), ST-LINK VCP = USART3 |

## 실습 순서

1. CubeMX로 USART6 설정 → 코드 생성
2. 레퍼런스 매뉴얼을 보고 **레지스터 기대값 계산**
3. 디버거로 **실제 레지스터 값 읽기**
4. 계산값과 실제값 비교 → HAL 코드(`HAL_UART_Init`, `HAL_UART_MspInit`)와 연결

## 1. CubeMX 설정

![CubeMX USART6 설정](docs/images/cubemx-usart6.png)

| 항목 | 값 |
|---|---|
| Mode | Asynchronous |
| Hardware Flow Control | Disable |
| Baud Rate | 9600 Bits/s |
| Word Length / Parity / Stop | 8 Bits / None / 1 |
| Data Direction / Over Sampling | Receive and Transmit / 16 Samples |
| USART6_TX 핀 | **PG14** (기본값 PC6에서 변경) |
| USART6_RX 핀 | PC7 (기본값) |

클럭: HSE 8MHz → PLL → **SYSCLK 168MHz**, APB1 = /4 → **PCLK1 42MHz**, APB2 = /2 → **PCLK2 84MHz**

## 2. 레지스터 기대값 계산

### 2-1. 주변장치 주소 (메모리 맵)

| 주변장치 | 버스 | Base 주소 |
|---|---|---|
| RCC | AHB1 | `0x4002 3800` |
| GPIOG | AHB1 | `0x4002 1800` |
| **USART6** | **APB2** | **`0x4001 1400`** |
| USART3 | APB1 | `0x4000 4800` |

### 2-2. 클럭 enable (RCC)

주변장치는 클럭을 켜야 레지스터에 쓸 수 있습니다. 쓰는 곳은 `HAL_UART_MspInit()`입니다.

| 레지스터 | 주소 | 비트 | 기대값 |
|---|---|---|---|
| RCC_APB2ENR | `0x4002 3844` | bit 5 `USART6EN` | **1** |
| RCC_AHB1ENR | `0x4002 3830` | bit 6 `GPIOGEN` | **1** |
| RCC_APB1ENR | `0x4002 3840` | bit 18 `USART3EN` | 1 |

### 2-3. 핀 설정 (GPIOG, PG14)

PG14를 USART6_TX로 쓰려면 **Alternate Function 모드 + AF8**로 설정해야 합니다. AF 번호는 데이터시트의 Alternate function 표에서 확인합니다.

| 레지스터 | 오프셋 | PG14 비트 | 값 | 의미 |
|---|---|---|---|---|
| GPIOG_MODER | `0x00` | [29:28] | `10` | Alternate function |
| GPIOG_OSPEEDR | `0x08` | [29:28] | `11` | Very high speed |
| GPIOG_PUPDR | `0x0C` | [29:28] | `00` | No pull |
| GPIOG_AFRH (`AFR[1]`) | `0x24` | [27:24] | `1000` | **AF8 = USART6** |

GPIOG에는 PG6(USB_PowerSwitchOn, 출력)도 설정되어 있어서 레지스터 전체 값은 다음과 같습니다.
- `GPIOG_MODER` = **`0x2000 1000`** (PG14 = AF, PG6 = Output)
- `GPIOG_AFRH` = **`0x0800 0000`**

### 2-4. USART 레지스터 (USART6)

| 레지스터 | 오프셋 | 주소 |
|---|---|---|
| USART_SR | `0x00` | `0x4001 1400` |
| USART_DR | `0x04` | `0x4001 1404` |
| **USART_BRR** | `0x08` | `0x4001 1408` |
| **USART_CR1** | `0x0C` | `0x4001 140C` |
| USART_CR2 | `0x10` | `0x4001 1410` |
| USART_CR3 | `0x14` | `0x4001 1414` |

#### BRR: Baud rate 계산

레퍼런스 매뉴얼의 공식(OVER8 = 0, 16배 오버샘플링):

```
Baud = f_PCLK / (16 × USARTDIV)   →   USARTDIV = f_PCLK / (16 × Baud)
```

**USART6** (APB2, PCLK2 = 84MHz, 9600bps)
```
USARTDIV = 84,000,000 / (16 × 9600) = 546.875
Mantissa = 546            = 0x222
Fraction = 0.875 × 16 = 14 = 0xE
BRR      = (0x222 << 4) | 0xE = 0x222E
```

**USART3** (APB1, PCLK1 = 42MHz, 115200bps)
```
USARTDIV = 42,000,000 / (16 × 115200) = 22.786
Mantissa = 22             = 0x16
Fraction = 0.786 × 16 = 12.6 → HAL은 12로 계산 = 0xC
BRR      = 0x16C
```

> HAL의 `UART_BRR_SAMPLING16()` 매크로([stm32f4xx_hal_uart.h](Drivers/STM32F4xx_HAL_Driver/Inc/stm32f4xx_hal_uart.h))는 정수 연산으로 계산합니다. 그래서 소수점 처리 방식에 따라 직접 계산한 값과 1 차이가 날 수 있습니다. 직접 비교해 보세요.
> 실제 baud = 42MHz / (16 × 22.75) ≈ 115,385bps (오차 약 +0.16%)

#### CR1 / CR2 / CR3: 프레임 형식과 동작

| 레지스터 | 비트 | 이름 | 값 | 의미 |
|---|---|---|---|---|
| CR1 | 15 | OVER8 | 0 | 16배 오버샘플링 |
| CR1 | **13** | **UE** | **1** | USART enable |
| CR1 | 12 | M | 0 | 데이터 8비트 |
| CR1 | 10 | PCE | 0 | 패리티 없음 |
| CR1 | **3** | **TE** | **1** | 송신 enable |
| CR1 | **2** | **RE** | **1** | 수신 enable |
| CR2 | [13:12] | STOP | `00` | Stop 1비트 |
| CR3 | 9, 8 | CTSE, RTSE | 0, 0 | 하드웨어 흐름제어 없음 |

→ **CR1 = `0x0000 200C`**, CR2 = `0x0000 0000`, CR3 = `0x0000 0000`

#### SR: 상태

| 비트 | 이름 | 의미 | 송신이 끝나 쉬고 있을 때 |
|---|---|---|---|
| 7 | TXE | 송신 데이터 레지스터 비었음 | 1 |
| 6 | TC | 송신 완료 | 1 |
| 5 | RXNE | 수신 데이터 있음 | 0 |

→ 대기 중 **SR = `0x0000 00C0`** 근처. `HAL_UART_Transmit()`는 이 TXE와 TC 비트를 기다리면서 DR에 데이터를 씁니다.

### 기대값 요약

| 레지스터 | 주소 | 기대값 |
|---|---|---|
| RCC_APB2ENR.USART6EN | `0x4002 3844` bit 5 | 1 |
| GPIOG_MODER | `0x4002 1800` | `0x2000 1000` |
| GPIOG_AFRH | `0x4002 1824` | `0x0800 0000` |
| **USART6_BRR** | `0x4001 1408` | **`0x0000 222E`** |
| **USART6_CR1** | `0x4001 140C` | **`0x0000 200C`** |
| USART6_CR2 | `0x4001 1410` | `0x0000 0000` |
| USART6_SR | `0x4001 1400` | `0x0000 00C0` (대기 중) |
| USART3_BRR | `0x4000 4808` | `0x0000 016C` |

## 3. 실제 레지스터 값 읽기

### 방법 A: 디버거 (VS Code)
1. `cmake --preset Debug && cmake --build --preset Debug`로 빌드합니다.
2. **F5**로 디버깅을 시작하고, `main.c`의 `while (1)` 안에 **브레이크포인트**를 겁니다.
3. 멈추면 아래 방법 중 하나로 확인합니다.
   - **Peripherals(XPERIPHERALS) 창**: `USART6`, `GPIOG`, `RCC`를 펼치면 비트 단위로 보입니다 (SVD 파일 필요).
   - **Debug Console**에서 GDB 명령으로 메모리를 읽습니다.
     ```
     x/7wx 0x40011400      # USART6: SR, DR, BRR, CR1, CR2, CR3, GTPR
     x/1wx 0x40021800      # GPIOG_MODER
     x/1wx 0x40021824      # GPIOG_AFRH
     x/1wx 0x40023844      # RCC_APB2ENR
     ```
   - **Watch** 창: `((USART_TypeDef *)0x40011400)->BRR`

### 방법 B: 코드에서 읽기
```c
uint32_t brr = USART6->BRR;   // 브레이크포인트를 걸고 brr 값을 확인
uint32_t cr1 = USART6->CR1;
```

### 확인 포인트
- [ ] `HAL_UART_Init()` **전**에는 USART6 레지스터가 모두 0인가? (클럭이 꺼져 있으면 읽어도 0)
- [ ] `HAL_UART_Init()` **후** BRR = `0x222E`, CR1 = `0x200C`인가?
- [ ] 직접 계산한 BRR과 HAL이 쓴 BRR이 같은가? 다르다면 왜 다른가?
- [ ] `HAL_UART_Transmit()` 직후 SR의 TXE/TC 비트가 1인가?
- [ ] CubeMX에서 Baud를 115200으로 바꾸면 BRR은 어떻게 바뀌는가? (계산 → 생성 → 확인)

## 4. 코드와 연결

| 레지스터 설정 | 실제로 쓰는 코드 |
|---|---|
| RCC enable, GPIO AF 설정 | `HAL_UART_MspInit()` · [Core/Src/stm32f4xx_hal_msp.c](Core/Src/stm32f4xx_hal_msp.c) |
| BRR, CR1, CR2, CR3 | `HAL_UART_Init()` → `UART_SetConfig()` · [stm32f4xx_hal_uart.c](Drivers/STM32F4xx_HAL_Driver/Src/stm32f4xx_hal_uart.c) |
| 송신 (DR 쓰기, SR 확인) | `HAL_UART_Transmit()` |
| 이 프로젝트의 루프 | [Core/Src/main.c](Core/Src/main.c) |

`main.c`에서는 USART6으로 `'A'`(0x41)를 반복 전송합니다. 같은 값을 USART3(시리얼 모니터, 115200bps)로 비트 단위로도 출력합니다.
```
A 0x41 bin:01000001 wire:0 10000010 1
```
`wire:`는 실제 전송 순서입니다: Start(0) + **LSB부터** 8비트 + Stop(1).

## 부록: 신호로 교차 확인

레지스터 설정이 맞으면 PG14에 9600bps 신호가 나와야 합니다. 1비트는 약 104µs입니다.

| Arduino UNO 핀 (회로도) | NUCLEO 헤더 | STM32 핀 | 연결 |
|---|---|---|---|
| TX→1 | D1 (CN10) | **PG14** (USART6_TX) | 오실로스코프 프로브 |
| GND | GND (CN7) | GND | 접지 클립 |

<details>
<summary>회로도 / 오실로스코프 설정</summary>

![NUCLEO-F446ZE 연결](docs/images/wiring-nucleo.svg)

![Arduino UNO 기준 회로도 (Tinkercad)](docs/images/wiring-tinkercad.png)

| 항목 | 값 |
|---|---|
| Coupling / V/div | DC / 1V |
| Time/div | 100µs |
| Trigger | Edge, Falling, ≈1.5V, Normal |

시리얼 모니터: STLink Virtual COM Port, **115200bps, 8N1**
</details>
