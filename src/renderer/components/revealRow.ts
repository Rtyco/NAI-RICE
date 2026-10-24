/** 추가 버튼은 머리줄에 있고 새 줄은 목록 끝에 붙어 화면 밖일 수 있다. */
export function revealRow(id: string): void {
  // 저장 뒤 React가 그 줄을 그린 다음에 찾는다. 편집 팝업이 라이브러리 화면 위에 같은 항목을 그리면 뒤의 것이 팝업이다.
  setTimeout(() => {
    const rows = document.querySelectorAll<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`);
    const row = rows[rows.length - 1];
    if (!row) return;
    row.scrollIntoView({ block: 'nearest' });
    const input = row.querySelector('input');
    input?.focus({ preventScroll: true });
    input?.select();
  });
}
