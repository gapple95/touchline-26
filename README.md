# TOUCHLINE 26

TOUCHLINE 26은 공식 축구 데이터를 감독의 선택과 결과로 연결하는 인터랙티브 전술 시뮬레이터입니다.

## 현재 구현 범위

- CONTROL, PRESS, CHASE, LOCK 저장 전술 즉시 전환
- 선수 드래그 배치와 클릭 교체
- 벤치 선수 교체
- 공격, 수비, 중앙 보호, 전환 속도 지표 비교
- 자연어 전술 요청을 저장 전술에 연결하는 AI 코치 데모
- 경기 후 결정 품질 리뷰
- 감독 성향 카드
- 동일 조건 기반 Tactical Duel 판정 화면
- 반응형 데스크톱·모바일 레이아웃

## 데이터 원칙

FIFA 공식 기록은 출처와 단위를 보존하고 수정하지 않습니다. 역할 적합도, 시너지, 전술 지표와 경기 평가는 `TOUCHLINE_DERIVED` 분류 및 방법론 버전과 함께 별도 객체로 관리합니다.

상세 객체 계약은 `lib/domain/football.ts`, 예시 데이터는 `data/`, 제품 정의는 `docs/PRODUCT_SPEC_V2.md`에서 확인할 수 있습니다.

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm ci
npm run dev
```

검증은 다음 명령으로 실행합니다.

```bash
npm run build
npm test
```

## 기술 구성

Next.js 16, React 19, TypeScript, vinext, Cloudflare Workers 호환 배포 구조를 사용합니다.
