# LIG D&A 부트캠프 · Embedded Study

LIG D&A 부트캠프 임베디드 스터디에서 진행한 STM32 **NUCLEO-F446ZE** 실습 모음입니다. (STM32CubeMX + CMake + Ninja + Arm GNU Toolchain)

## 프로젝트

| 폴더 | 내용 | 핵심 |
|---|---|---|
| [pull-up-pull-down](pull-up-pull-down/) | 버튼 입력(PF13)을 읽어 LED(PF12) 제어, 입력값을 시리얼로 출력 | GPIO 입력 / 풀업·풀다운 저항, `printf` → USART3 |
| [UART_OSILO](UART_OSILO/) | 레퍼런스 매뉴얼(RM0390)과 데이터시트를 보고 USART6(PG14, 9600bps) 레지스터 기대값을 계산한 뒤, 디버거로 실제 레지스터 값과 비교 | RCC / GPIO AF / USART BRR·CR1·SR 레지스터 분석 |
