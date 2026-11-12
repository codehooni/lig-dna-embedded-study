# LIG D&A 부트캠프 · Embedded Study

LIG D&A 부트캠프 임베디드 스터디에서 진행한 STM32 **NUCLEO-F446ZE** 실습 모음입니다. (STM32CubeMX + CMake + Ninja + Arm GNU Toolchain)

## 프로젝트

| 폴더 | 내용 | 핵심 |
|---|---|---|
| [pull-up-pull-down](pull-up-pull-down/) | 버튼 입력(PF13)을 읽어 LED(PF12) 제어, 입력값을 시리얼로 출력 | GPIO 입력 / 풀업·풀다운 저항, `printf` → USART3 |
| [UART_OSILO](UART_OSILO/) | USART6(PG14, 9600bps)로 `'A'`를 반복 전송해 오실로스코프로 파형 관찰, 같은 데이터를 비트 단위 문자열로 USART3(115200bps)에 출력 | UART 프레임(Start/Data LSB first/Stop) |
