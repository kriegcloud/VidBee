const stepToMedia = (id) => {
  const handle = (element) => element.swiper ?? null;
  let found = null;
  for (const candidate of document.querySelectorAll(".b-slideshow")) {
    const swiper = handle(candidate);
    const slides = swiper?.virtual?.slides ?? [];
    if (swiper && slides.some((slide) => String(slide?.key ?? "") === id)) {
      found = { element: candidate, swiper };
      break;
    }
  }
  if (!found?.swiper.slideNext) {
    return null;
  }
  found.element.scrollIntoView({ block: "center", inline: "center" });
  const index = (found.swiper.virtual?.slides ?? []).findIndex((slide) => String(slide?.key ?? "") === id);
  if (index < 0) {
    return null;
  }
  if (found.swiper.activeIndex < index) {
    found.swiper.slideNext();
  } else if (found.swiper.activeIndex > index && found.swiper.slideTo) {
    found.swiper.slideTo(index);
  }
  return { active: found.swiper.activeIndex, index };
};
const readMediaStateInPage = (expected) => {
  const videos = [...document.querySelectorAll("video")];
  const video =
    (expected > 0
      ? videos.find((entry) => Number.isFinite(entry.duration) && Math.abs(entry.duration - expected) < 2)
      : undefined) ??
    videos.find((entry) => !entry.paused && entry.currentTime > 0) ??
    videos.find((entry) => entry.videoWidth > 0) ??
    videos[0];
  if (!video) {
    return null;
  }
  return {
    currentTime: video.currentTime || 0,
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    paused: video.paused,
    ended: video.ended,
  };
};
const swiperPointInPage = (id) => {
  let element = null;
  for (const candidate of document.querySelectorAll(".b-slideshow")) {
    const swiper = candidate.swiper;
    if (swiper?.virtual?.slides?.some((slide) => String(slide?.key ?? "") === id)) {
      element = candidate;
      break;
    }
  }
  const active = element?.querySelector(".swiper-slide-active img, .swiper-slide-active button");
  if (!(active instanceof HTMLElement)) {
    return null;
  }
  active.scrollIntoView({ block: "center", inline: "center" });
  const box = active.getBoundingClientRect();
  if (box.width < 2 || box.height < 2) {
    return null;
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const attachmentPointInPage = ({ needles, labels }) => {
  const nodes = [...document.querySelectorAll('a, button, [role="button"], img, div, span')];
  const targetFor = (element) => {
    const clickable = element.closest('button, a, [role="button"]');
    const chosen = clickable ?? element;
    return chosen instanceof HTMLElement ? chosen : null;
  };
  const boxOf = (element) => {
    element.scrollIntoView({ block: "center", inline: "center" });
    const box = element.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) {
      return null;
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  for (const needle of needles) {
    const match = nodes.find((element) =>
      [...element.attributes].some((attribute) => attribute.value.includes(needle))
    );
    const target = match ? targetFor(match) : null;
    const box = target ? boxOf(target) : null;
    if (box) {
      return box;
    }
  }
  for (const label of labels) {
    const match = nodes.find((element) => (element.textContent ?? "").trim() === label);
    const target = match ? targetFor(match) : null;
    const box = target ? boxOf(target) : null;
    if (box) {
      return box;
    }
  }
  return null;
};
const clickMediaInPage = () => {
  const mediaId = new URLSearchParams(window.location.search).get("media");
  if (!mediaId) {
    return;
  }
  const match = Array.from(document.querySelectorAll('a, button, [role="button"]')).find((element) => {
    const href = element.getAttribute("href") || "";
    return href.includes(mediaId) || element.innerHTML.includes(mediaId);
  });
  if (match instanceof HTMLElement) {
    match.click();
  }
};
const seekStartInPage = (expected) => {
  const videos = [...document.querySelectorAll("video")];
  const video =
    (expected > 0
      ? videos.find((entry) => Number.isFinite(entry.duration) && Math.abs(entry.duration - expected) < 2)
      : undefined) ??
    videos.find((entry) => !entry.paused && entry.currentTime > 0) ??
    videos[0];
  if (!video) {
    return;
  }
  if (video.currentTime > 0.4) {
    video.currentTime = 0;
  }
  video.play();
};
const placeVideoInPage = ({ expected, width, height }) => {
  const videos = [...document.querySelectorAll("video")];
  const video =
    (expected > 0
      ? videos.find((entry) => Number.isFinite(entry.duration) && Math.abs(entry.duration - expected) < 2)
      : undefined) ??
    videos.find((entry) => entry.videoWidth > 0) ??
    videos[0];
  if (!video) {
    return null;
  }
  document.documentElement.appendChild(video);
  video.style.position = "fixed";
  video.style.left = "0";
  video.style.top = "0";
  video.style.margin = "0";
  video.style.opacity = "1";
  video.style.visibility = "visible";
  video.style.zIndex = "2147483647";
  if (width > 0 && height > 0) {
    video.style.width = `${width}px`;
    video.style.height = `${height}px`;
  }
  const mark = document.createElement("div");
  mark.id = "vidbee-grab-mark";
  mark.style.cssText =
    "position:fixed;left:0;top:0;width:8px;height:8px;background:#ff00ff;z-index:2147483647;pointer-events:none";
  document.documentElement.appendChild(mark);
  const rect = video.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
};
const removeMarkerInPage = () => document.getElementById("vidbee-grab-mark")?.remove();
const profileScrollInPage = ({ nested, chat }) => {
  const step = Math.max(600, window.innerHeight * 0.8) * (chat ? -1 : 1);
  // At the end of a loaded feed the scroll no longer moves and fires no scroll event,
  // so infinite loaders never re-arm. Back off half a step so the next pass scrolls again.
  const scrollWindow = () => {
    const before = window.scrollY;
    window.scrollBy(0, step);
    if (window.scrollY !== before) return true;
    window.scrollBy(0, -step / 2);
    return false;
  };
  if (!nested) return scrollWindow();
  const candidates = [...document.querySelectorAll("main, section, div")]
    .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
    .filter(
      ({ element, bounds }) =>
        bounds.width > 300 &&
        bounds.height > 200 &&
        bounds.bottom > 0 &&
        bounds.top < window.innerHeight &&
        element.scrollHeight > element.clientHeight + 10 &&
        /auto|scroll/.test(getComputedStyle(element).overflowY)
    );
  const contentPane = candidates.filter(({ bounds }) => bounds.left >= window.innerWidth * 0.45);
  const choices = contentPane.length > 0 ? contentPane : candidates;
  choices.sort((a, b) =>
    contentPane.length > 0
      ? b.bounds.left - a.bounds.left
      : b.element.scrollHeight - b.element.clientHeight - (a.element.scrollHeight - a.element.clientHeight)
  );
  for (const { element } of choices) {
    const before = element.scrollTop;
    element.scrollTop += step;
    if (element.scrollTop !== before) {
      return true;
    }
  }
  if (choices[0] !== undefined) choices[0].element.scrollTop -= step / 2;
  return scrollWindow();
};
const viewportInPage = () => ({ width: window.innerWidth, height: window.innerHeight });
// The original inline Playwright init callback is anonymous.
const seedLocalStorageInPage =
  (0,
  (values) => {
    for (const [key, value] of Object.entries(values)) {
      try {
        window.localStorage.setItem(key, value);
      } catch {}
    }
  });

export {
  attachmentPointInPage,
  clickMediaInPage,
  placeVideoInPage,
  profileScrollInPage,
  readMediaStateInPage,
  removeMarkerInPage,
  seedLocalStorageInPage,
  seekStartInPage,
  stepToMedia,
  swiperPointInPage,
  viewportInPage,
};
