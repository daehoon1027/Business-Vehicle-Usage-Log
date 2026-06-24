# 법인차량 운행일지

업무용 차량 운행 내역을 웹에서 입력하고, Firebase Realtime Database에 저장해 여러 사용자가 함께 확인할 수 있는 정적 웹앱입니다.

배포 주소:
- [https://business-vehicle-usage-log.web.app/](https://business-vehicle-usage-log.web.app/)

## 현재 구조

- `public/index.html`: 앱 화면 구조
- `public/assets/app.css`: 앱 스타일
- `public/assets/app.js`: Firebase 연동 및 화면 동작
- `firebase.json`: Firebase Hosting 배포 설정
- `.firebaserc`: 기본 Firebase 프로젝트 설정
- `차량운행일지.html`: 로컬 진입용 리다이렉트 파일

## 현재 기능

- 운행 기록 입력 / 수정 / 삭제
- Firebase Realtime Database 실시간 반영
- 차량번호 로컬 저장
- 영수증 이미지 업로드 및 미리보기
- 영수증 이미지는 Firebase Storage에 저장하고, Realtime Database에는 다운로드 URL과 파일 경로만 저장
- 엑셀 파일 저장
- 인쇄

## 기술 메모

- 프런트엔드: 정적 HTML/CSS/JavaScript
- 스타일: Tailwind CDN + `public/assets/app.css`
- 데이터 저장: Firebase Realtime Database
- 이미지 저장: Firebase Storage
- 엑셀 내보내기: SheetJS CDN

## Firebase 연동 상태

현재 배포본은 Firebase Hosting만 쓰는 것이 아니라, 아래처럼 Realtime Database까지 직접 연결되어 있습니다.

- 프로젝트 ID: `business-vehicle-usage-log`
- DB 경로: `carLogs`
- Storage 경로: `receipts/{운행기록키}/...`

주의할 점:
- Firebase 웹 설정값은 공개돼도 괜찮지만, 실제 접근 제어는 Database Rules로 해야 합니다.
- 영수증 업로드를 쓰려면 Firebase Storage Rules도 현재 운영 방식에 맞게 설정되어 있어야 합니다.
- 현재 앱은 로그인 없이 동작하고, 삭제/초기화 보호를 프런트엔드 비밀번호 프롬프트로만 처리합니다.
- 이 방식은 보안 통제로 충분하지 않으므로, 이후에는 인증 또는 Rules 강화가 필요합니다.

## 개발 및 배포

```bash
firebase login
firebase use business-vehicle-usage-log
firebase deploy --only hosting
```

미리보기 배포:

```bash
firebase hosting:channel:deploy preview
```

## GitHub 운영 권장 방식

- 이 저장소에서 앱 코드와 Firebase 설정을 함께 관리합니다.
- `.firebase/`는 로컬 캐시이므로 커밋하지 않습니다.
- Firebase CLI 로그인 토큰 같은 개인 인증 정보는 저장소에 넣지 않습니다.
- 코드 변경과 Firebase 설정 변경을 같은 저장소 히스토리로 추적하는 방식이 가장 관리하기 쉽습니다.

## 다음 권장 작업

1. GitHub 원격 저장소 연결
2. 현재 Firebase Database Rules 백업
3. Firebase Authentication 도입 검토
   사용자별 입력 권한과 삭제 권한을 안전하게 분리할 수 있습니다.
