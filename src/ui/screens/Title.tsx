import React from "react";
import { controller } from "../controller";

function suggestSeed(): string {
  const n = Math.floor(Math.random() * 9000) + 1000;
  const wards = ["ER", "MICU", "7W", "CCU", "SICU"];
  return `${wards[Math.floor(Math.random() * wards.length)]}-${n}`;
}

export function TitleScreen({ onHelp }: { onHelp: () => void }) {
  const [seed, setSeed] = React.useState(suggestSeed);
  const [confirmNew, setConfirmNew] = React.useState(false);
  const saved = controller.hasSave() ? controller.savedSummary() : null;
  const start = () => {
    if (saved && !confirmNew) {
      setConfirmNew(true);
      return;
    }
    controller.newGame(seed.trim() || suggestSeed());
  };
  return (
    <div className="title-wrap">
      <form
        className="sheet title-sheet"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <div className="title-top">
          <div>
            <div className="eyebrow">표준 처방 세트 · STANDARD ORDER SET</div>
            <h1 className="title-logo">오더 세트</h1>
            <div className="title-sub">의학 덱빌딩 로그라이크 — 한 환자의 입원 경과를 끝까지 책임진다</div>
          </div>
          <div className="title-code">
            <div className="form-code">양식 OS-01 · 개정 2.0</div>
            <div className="title-stamp" aria-hidden="true">
              입원
              <br />
              지시
            </div>
          </div>
        </div>

        <div className="title-grid">
          <div className="title-fields">
            <label className="field" htmlFor="seed">
              <span className="field-label">등록번호 (시드)</span>
              <span className="field-row">
                <input id="seed" className="field-input mono" value={seed} onChange={(e) => setSeed(e.target.value)} maxLength={24} spellCheck={false} autoComplete="off" />
                <button type="button" className="btn" onClick={() => setSeed(suggestSeed())}>
                  다시 뽑기
                </button>
              </span>
              <span className="field-help">같은 등록번호면 같은 지도·같은 환자·같은 운으로 시작한다.</span>
            </label>

            <div className="title-actions">
              {confirmNew ? (
                <div className="confirm-box" role="alert">
                  <span>진행 중인 입원 기록이 지워진다. 새로 입원시킬까?</span>
                  <span className="confirm-btns">
                    <button type="submit" className="btn btn-primary">
                      새로 입원
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirmNew(false)}>
                      취소
                    </button>
                  </span>
                </div>
              ) : (
                <button type="submit" className="stamp-btn">
                  입원 수속
                </button>
              )}
              {saved && !confirmNew && (
                <button type="button" className="btn btn-primary title-continue" onClick={() => controller.loadSave()}>
                  이어서 진료 <span className="title-saved">{saved}</span>
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={onHelp}>
                진료 안내
              </button>
            </div>
          </div>

          <ol className="title-rules">
            <li>
              <b>환자는 한 명이다.</b> 응급실에서 시작해 병동, 중환자실을 거친다. 활력이 0이 되면 끝난다.
            </li>
            <li>
              <b>주호소만으로는 모른다.</b> 무엇을 묻고 검사할지 골라 감별 목록을 좁히고, 작업 진단을 정한다. 틀리면 바꾼다.
            </li>
            <li>
              <b>약은 처방집에 있다.</b> 투약 오더로 불러낸다. 약은 적응증이 있는 병에만 듣고, 듣지 않으면 그것도 소견이다.
            </li>
            <li>
              <b>금기 약은 병을 키운다.</b> 투여 중인 약끼리는 상호작용한다. 약에 커서를 올리면 DUR 점검이 뜬다.
            </li>
          </ol>
        </div>

        <footer className="title-fine">
          <span>오락용 게임입니다. 수치와 효과는 실제 임상 판단의 근거가 아닙니다.</span>
          <span className="mono">개인 비상업 프로젝트</span>
        </footer>
      </form>
    </div>
  );
}
