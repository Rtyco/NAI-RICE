/** autoFocus와 onFocus의 select()는 두 번 클릭으로 열 때 선택이 풀렸다. ref 함수가 바뀌지 않아 처음 한 번만 불린다. */
export function focusAndSelect(input: HTMLInputElement | null): void {
  input?.focus();
  input?.select();
}
