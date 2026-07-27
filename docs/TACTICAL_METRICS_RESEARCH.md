# TOUCHLINE 26 라이브 전술 지표 조사 및 산식

## 결론

TOUCHLINE 26의 라이브 전술 지표는 **경기 결과 통계가 아니라 감독이 설계한 전술의 계획값**이다. 선수 좌표, 팀 지침, 개인 지침, 패스 연결, 선수 관계와 체력 입력을 이용해 0–100 점수와 배치 기반 미터 값을 즉시 계산한다.

FIFA 공식 경기 지표와 혼동하지 않도록 화면에는 `LIVE PLAN INDEX · TOUCHLINE DERIVED`를 표시한다. xG, 실제 볼 회수 시간, 강제 턴오버, 실제 파이널 서드 진입 횟수처럼 볼·상대·시간 이벤트가 필요한 항목은 전술보드만으로 생성하지 않는다.

실제 가중치와 기계 판독용 정의는 [`data/tactical-metric-model.json`](../data/tactical-metric-model.json)에 저장한다.

## 공식 기준

FIFA는 2022 월드컵에서 다음 11개 Enhanced Football Intelligence(EFI) 지표를 도입했다.

1. Possession control
2. Ball recovery time
3. Line breaks
4. Defensive line height and team length
5. Final third entries
6. Forced turnovers
7. Pressure on the ball
8. Expected goals
9. Team shape
10. Receptions behind midfield and defensive lines
11. Phases of play

핵심 정의와 TOUCHLINE 적용 방식은 다음과 같다.

| FIFA 개념 | 공식 정의의 핵심 | TOUCHLINE 적용 |
|---|---|---|
| 플레이 단계 | 빌드업, 전진, 파이널 서드, 카운터어택과 하이 프레스, 미드/로우 블록, 카운터프레스 등으로 볼 인플레이 시간을 분류 | 좌표와 지침으로 **의도한 단계**를 분류 |
| 라인 브레이크 | 패스·크로스·볼 운반이 상대 유닛의 가장 깊은 선을 넘어서는 행동 | 지정 패스의 전진 거리와 적극도로 **잠재력** 추정 |
| 수비 라인 높이 | 자기 골라인부터 가장 깊은 수비 라인까지의 거리 | 보드의 가장 낮은 아웃필드 유닛 좌표를 105m 기준으로 환산 |
| 팀 길이 | 골키퍼를 제외한 가장 낮은 선수와 가장 높은 선수 사이 거리 | 최전방 한 명을 제외한 블록 길이를 105m 기준으로 표시 |
| 팀 형태 | 팀 동료 대비 위치에서 기능적 역할과 실제 구조를 도출 | 선수 좌표로 폭, 길이, 중앙 밀도, 라인 간격 계산 |
| 파이널 서드 진입 | 패스 또는 운반 후 파이널 서드에서 성공적으로 소유 | 파이널 서드 배치 인원과 전진 의도로 **잠재력** 추정 |
| 볼 압박 | 수비수가 볼 소유자와의 공간을 줄여 시간과 선택지를 제한 | 적극성, 수비 가담, 라인 높이, 커버 관계로 **압박 의도** 추정 |
| 강제 턴오버 | 압박 결과 다음 터치에서 상대가 볼을 잃고 수비 팀이 소유 | 실제 이벤트 없이는 계산하지 않음 |
| 볼 회수 시간 | 소유를 잃은 뒤 다음 소유를 회복하기까지 걸린 시간 | 실제 이벤트 없이는 계산하지 않음 |
| xG | 슈팅 위치, 신체 부위, 선수 위치, 직전 행동 등으로 득점 확률 계산 | 슈팅 데이터 없이는 계산하지 않음 |

## 배치와 지침에서 계산하는 값

### 직접 계산

- 수비 라인 높이(m): 가장 낮은 아웃필드 3명의 평균 x좌표 × 105m
- 팀 길이(m): 최전방 한 명을 제외한 블록의 최고·최저 x좌표 차이 × 105m
- 팀 폭(m): 아웃필드 최고·최저 y좌표 차이 × 68m
- 중앙 밀도: 각 선수의 중앙선(y=50) 근접도를 평균
- 컴팩트니스: 팀 길이와 폭을 정규화해 결합

### 의도 기반 추정

- 공격 위협: 파이널 서드 점유, 전진 의도, 돌파, 공격 가담, 폭 활용, 패스 연결, 체력
- 수비 안정: 컴팩트니스, 수비 가담, 중앙 밀도, 커버 관계, 뒷공간 위험의 역수, 체력
- 중앙 보호: 중앙 밀도, 컴팩트니스, 수비 가담, 중앙 패스 의도, 라인 연결, 커버 관계
- 전환 속도: 적극성, 공격 가담, 패스 전진성, 돌파, 압박 의도, 체력
- 체력 부담: 적극성, 공격 가담, 수비 가담, 돌파, 대형 확장, 현재 체력 부족분
- 압박 의도: 적극성, 수비 가담, 수비 라인 높이, 공격 가담, 커버 관계
- 전진 의도: 패스 빈도, 지정 패스 전진성, 공격 가담, 돌파, 공격 관계
- 뒷공간 위험: 수비 라인 높이, 공격 가담, 낮은 수비 가담, 대형 길이, 부족한 커버

각 합성 점수의 가중치 합은 1이며 최종값은 0–100으로 제한한다. 선수별 값이 없으면 팀 지침을 상속하고, 공격/수비 가담 방향은 해당 지침에 보정값으로 반영한다.

## 추가로 조사했지만 계획 지표에 섞지 않은 값

- **PPDA**: 상대가 허용받은 패스 수를 특정 구역의 수비 행동 수로 나눈 관측 지표다. 숫자가 낮을수록 압박 강도가 높다고 해석하지만, 상대 패스와 태클·인터셉션·도전·파울 이벤트가 없으면 계산할 수 없다. TOUCHLINE은 이를 가짜 PPDA로 표시하지 않고 `압박 의도`로 분리한다.
- **행동 가치(VAEP/OBV 계열)**: 패스, 크로스, 드리블, 슈팅 등 실제 행동 전후의 득점·실점 확률 변화를 평가한다. 전술보드의 지정 행동은 실제 성공 행동이 아니므로 관측 계층에서만 사용한다.
- **기대 위협(xT/EPV 계열)**: 위치별 득점·진행 가치를 학습해 볼 이동의 위협 변화를 평가한다. 학습 데이터와 실제 볼 이동이 연결된 뒤 추가한다.
- **피치 컨트롤·공간 지배**: 양 팀 선수의 위치, 속도, 도달 시간을 이용한다. 현재 보드에는 상대 위치와 시계열 속도가 없으므로 계산하지 않는다.
- **필드 틸트**: 양 팀의 공격 지역 터치·패스 점유 비율이 필요하다. 경기 이벤트가 연결되면 관측 지표로 제공한다.

## 해석 원칙

- 점수가 높다고 항상 좋은 것은 아니다. 공격 위협과 수비 안정, 전환 속도와 체력 부담, 수비 라인과 뒷공간 위험은 트레이드오프다.
- 미확정 변경도 즉시 계산한다. `전술 확정`은 비교 기준 스냅샷을 갱신한다.
- 확정 기준 대비 변화량은 공격·수비·중앙 지표에 표시한다.
- 실제 경기 데이터가 연결되면 계획값과 관측값을 나란히 두되 같은 필드로 덮어쓰지 않는다.

## 출처

- FIFA, [Enhanced Football Intelligence explanation document](https://www.fifatrainingcentre.com/media/native/world-cup-2022/Enhanced%20Football%20Intelligence%20EN.pdf)
- FIFA Training Centre, [FIFA to introduce enhanced football intelligence at FIFA World Cup 2022](https://www.fifatrainingcentre.com/en/fifa-to-introduce-enhanced-football-intelligence-at-fifa-world-cup-2022.php)
- FIFA Training Centre, [Defensive line height and team length](https://www.fifatrainingcentre.com/en/fwc2022/efi-metrics/efi-metric--defensive-line-height-and-team-length.php)
- FIFA Training Centre, [Controlling the game without the ball: The mid-block and compactness](https://www.fifatrainingcentre.com/en/fwc2022/technical-and-tactical-analysis/controlling-the-game-without-the-ball--the-mid-block-and-compactness.php)
- FIFA Training Centre, [Use of wide areas to create goal-scoring opportunities](https://www.fifatrainingcentre.com/en/fwc2022/technical-and-tactical-analysis/use-of-wide-areas.php)
- FIFA Training Centre, [Investigating the increased use of the high press](https://www.fifatrainingcentre.com/en/game/tournaments/fcwc/2025/team-analyses/increased-use-of-high-press-and-pressing-strategies.php)
- IFAB, [Law 1 – The Field of Play](https://www.theifab.com/laws/latest/the-field-of-play/)
- Colin Trainor, [Defensive Metrics: Measuring the Intensity of a High Press](https://statsbomb.com/articles/soccer/defensive-metrics-measuring-the-intensity-of-a-high-press/)
- Decroos et al., [Actions Speak Louder Than Goals: Valuing Player Actions in Soccer](https://arxiv.org/abs/1802.07127)
- Narizuka, Yamazaki & Takizawa, [Space evaluation in football games via field weighting based on tracking data](https://arxiv.org/abs/2001.11629)
