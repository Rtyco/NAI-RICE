/** 새 줄은 목록 끝에 붙어, 맨 위에서 추가하면 화면에 아무 변화가 없어 보였다. */
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
