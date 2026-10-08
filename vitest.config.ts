import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  // legacy/는 git에 넣지 않는 개인 백업 폴더라 테스트에서 뺀다.
  test: { exclude: [...configDefaults.exclude, 'legacy/**'] },
});
