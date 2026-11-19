import { startBackground } from "../src/Background.entry.js";
export default defineBackground(() => {
  startBackground({ browser });
});
