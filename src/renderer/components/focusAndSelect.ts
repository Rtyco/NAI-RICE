/**
 * 이름 바꾸기 칸에 ref로 붙인다. 나타나자마자 포커스를 주고 글자를 모두 선택해 바로 새 이름을 칠 수 있게 한다.
 * (autoFocus와 onFocus의 select()는 두 번 클릭으로 열 때 선택이 풀려 있었다.) 함수가 바뀌지 않아 처음 한 번만 불린다.
 */
export function focusAndSelect(input: HTMLInputElement | null): void {
  input?.focus();
  input?.select();
}
