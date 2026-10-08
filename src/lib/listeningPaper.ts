/**
 * Turns an exported listening paper into something a student can open.
 *
 * The papers come out of the authoring tool as one HTML file with the audio
 * base64'd inside it — four parts came to 52 MB, which a student on a phone
 * would have to download in full before seeing the first question. So the
 * audio is lifted out and stored as plain MP3s, and the page is rewritten to
 * fetch them when a part is opened. What is left is about a megabyte.
 *
 * This runs in the teacher's browser rather than on the server. Fifty
 * megabytes through a proxy is a request most of them refuse by default and
 * all of them time out eventually; doing it here means only the pieces
 * travel, and they go straight to storage.
 *
 * The paper already grades itself: each part is a same-origin srcdoc iframe
 * exposing `DATA.questionIds`, `getAnswer(q)` and `isCorrect(q)`, and the
 * outer page has a `finishAll()` that walks all four. Rather than reimplement
 * any of that, a small reporter is appended that reads those same functions
 * after grading and posts the result to whatever embedded the page.
 */

export type ExtractedAudio = { id: string; base64: string };
export type PreparedPaper = { html: string; audio: ExtractedAudio[]; parts: number };

/** The exported pages mark audio like `<script type="application/octet-stream" id="audio-P1">`. */
const audioBlockPattern = /<script type="application\/octet-stream" id="audio-([^"]+)">([\s\S]*?)<\/script>/g;

export function prepareListeningPaper(source: string): PreparedPaper {
  const audio: ExtractedAudio[] = [];

  // Lift each audio blob out and leave an empty marker behind, so the page
  // keeps its shape and the ids stay findable.
  let html = source.replace(audioBlockPattern, (_match, id: string, base64: string) => {
    audio.push({ id, base64: base64.trim() });
    return `<!-- audio ${id} served separately -->`;
  });

  // The outer page built a Blob from the inlined base64; now it hands back a
  // URL the browser can stream from instead.
  html = html.replace(
    /<script>\s*const __blobs=\{\};[\s\S]*?window\.__audioBlob=function\(id\)\{[\s\S]*?\};\s*<\/script>/,
    audioShim
  );

  // Each part did `URL.createObjectURL(parent.__audioBlob('P1'))`. The quotes
  // are HTML-escaped inside srcdoc, so both spellings are rewritten.
  const callPattern = /URL\.createObjectURL\(parent\.__audioBlob\((?:'|&#39;|&quot;|")([^'&"]+)(?:'|&#39;|&quot;|")\)\)/g;
  html = html.replace(callPattern, (_match, id: string) => `parent.__audioURL('${id}')`);

  const parts = (html.match(/<iframe/g) || []).length;
  html = html.replace(/<\/body>\s*<\/html>\s*$/i, `${reporter}\n</body>\n</html>`);

  return { html, audio, parts };
}

/** True for a file that looks like one of these exports rather than any HTML. */
export function looksLikeListeningPaper(source: string) {
  return source.includes("__audioBlob") || /id="audio-P\d"/.test(source);
}

const audioShim = `<script>
// The audio lives beside the page now; __AUDIO is filled in when it is served.
window.__AUDIO = window.__AUDIO || {};
window.__audioURL = function(id){ return window.__AUDIO[id] || ""; };
window.__audioBlob = function(id){ return window.__AUDIO[id] || ""; };
</script>`;

/**
 * Reports the result out to the embedding page.
 *
 * It wraps the paper's own `finishAll`, so grading stays exactly as the
 * author wrote it and this only reads what is already on screen. The answer
 * and the verdict come from the part's own functions, which is what the tab
 * badges use, so the student and the teacher cannot disagree.
 */
const reporter = `<script>
(function () {
  var post = function (payload) {
    var message = Object.assign({ type: "graderley:listening" }, payload);
    // Embedded in a page, the listener is the parent; opened in its own tab
    // it is the opener. Posting to both costs nothing and covers either.
    try { if (parent && parent !== window) parent.postMessage(message, "*"); } catch (e) {}
    try { if (window.opener) window.opener.postMessage(message, "*"); } catch (e) {}
  };

  var collect = function () {
    var frames = [].slice.call(document.querySelectorAll(".stage iframe"));
    var tabs = [].slice.call(document.querySelectorAll(".tab"));
    var parts = [];
    var correct = 0;
    var total = 0;
    frames.forEach(function (frame, i) {
      var w = frame.contentWindow;
      if (!w || !w.DATA || !w.DATA.questionIds) return;
      var label = tabs[i] && tabs[i].querySelector("b") ? tabs[i].querySelector("b").textContent : "P" + (i + 1);
      var questions = w.DATA.questionIds.map(function (q) {
        var answer = "";
        try { answer = w.getAnswer ? String(w.getAnswer(q) == null ? "" : w.getAnswer(q)) : ""; } catch (e) {}
        var ok = false;
        try { ok = !!w.isCorrect(q); } catch (e) {}
        if (ok) correct += 1;
        total += 1;
        return { question: String(q), answer: answer, correct: ok };
      });
      parts.push({ part: label, questions: questions });
    });
    return { parts: parts, correct: correct, total: total };
  };

  var original = window.finishAll;
  window.finishAll = function () {
    var out = original.apply(this, arguments);
    // finishAll toggles review on and off; only report when it has just graded.
    var showing = (document.getElementById("total") || {}).textContent || "";
    if (showing) post(collect());
    return out;
  };

  // So the embedding page can ask at any time, e.g. when the exam closes.
  window.addEventListener("message", function (event) {
    if (event.data && event.data.type === "graderley:collect") post(collect());
  });

  post({ ready: true });
})();
</script>`;

/** base64 to bytes, for a browser that has no Buffer. */
export function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
