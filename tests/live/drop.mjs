// Lost signal, as the phone sees it (2026-11-04). Requests and answers are
// dropped inside the page's own network stack, through the Chrome DevTools
// Protocol's Fetch domain:
//   "before": the request fails before it leaves the phone;
//   "after":  the server gets the request and acts on it, and its answer is
//             lost on the way back.
// The browser sends everything itself, so it works the same against a local
// server and the deployed site. Playwright's route.fetch() can't stand in
// for "after": it sends from the test's own process, which can't always
// reach the site the browser reaches (it couldn't from the build sandbox).
//
// decide(request, stage) gets { method, url, body } and "request" or
// "response", and returns "drop" to drop it there, anything else to let it
// through. Only fetch() requests are looked at (server actions among them).
export async function interceptFetches(page, decide) {
  const cdp = await page.context().newCDPSession(page);
  // What was decided at the request stage, for its answer.
  const planned = new Map();
  cdp.on("Fetch.requestPaused", (event) => {
    const atResponse = event.responseStatusCode !== undefined || event.responseErrorReason !== undefined;
    const request = {
      method: event.request.method,
      url: event.request.url,
      body: event.request.postData ?? "",
    };
    let verdict;
    if (atResponse) {
      verdict = planned.has(event.requestId) ? planned.get(event.requestId) : decide(request, "response");
      planned.delete(event.requestId);
    } else {
      verdict = decide(request, "request");
      if (verdict !== "drop") planned.set(event.requestId, decide(request, "response"));
    }
    const send =
      verdict === "drop"
        ? cdp.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "InternetDisconnected" })
        : atResponse
          ? cdp.send("Fetch.continueResponse", { requestId: event.requestId }).catch(() =>
              cdp.send("Fetch.continueRequest", { requestId: event.requestId }),
            )
          : cdp.send("Fetch.continueRequest", { requestId: event.requestId });
    send.catch(() => {
      // The page moved on, or the request ended by itself.
    });
  });
  await cdp.send("Fetch.enable", {
    patterns: [
      { urlPattern: "*", resourceType: "Fetch", requestStage: "Request" },
      { urlPattern: "*", resourceType: "Fetch", requestStage: "Response" },
    ],
  });
  return async () => {
    await cdp.send("Fetch.disable").catch(() => {});
    await cdp.detach().catch(() => {});
  };
}
