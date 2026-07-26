# TOUCHLINE 26

월드컵의 한 경기를 다시 지휘하는 인터랙티브 전술 시뮬레이터입니다. 첫 시나리오는 2022 FIFA 월드컵 조별리그 대한민국 대 포르투갈전입니다.

## 감독 경험

- 4-2-3-1, 4-3-3, 3-4-3 포메이션 전환
- 드래그앤드롭 또는 클릭으로 선수 위치 교환
- 벤치 선수 드래그 교체
- 압박 강도, 수비 라인, 공격 리스크 조절
- 경기 시점별 매치 플랜과 전술 적합도 분석
- 선택을 반영한 결과 시뮬레이션

## 데이터

경기 맥락과 결과는 FIFA의 공식 2022 대한민국–포르투갈 경기 기록을 참고합니다. 이벤트 데이터 모델은 StatsBomb Open Data의 2022 월드컵 공개 데이터 구조를 참고했습니다. 화면의 전술 적합도, 승리 확률, 예상 득점은 사용자 선택을 설명하기 위한 교육용 시뮬레이션 지표이며 실제 예측값이 아닙니다.

- FIFA 경기 리포트: https://www.fifa.com/en/articles/korea-republic-portugal-world-cup-qatar-2022-group-h-match-report
- StatsBomb Open Data: https://github.com/statsbomb/open-data

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm ci
npm run dev
```

프로덕션 빌드는 `npm run build`로 생성합니다.

## 기술

Next.js 16, React 19, TypeScript, vinext, Cloudflare Workers 호환 배포 구조를 사용합니다. 별도 API 키, 회원가입, 유료 서비스가 필요하지 않습니다.
