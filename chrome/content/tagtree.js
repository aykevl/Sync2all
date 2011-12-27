
/* Code to make it easier to work with tagged structures, by moving part of the
 * work to a separate file.
 */

tagtree = {};

tagtree.enabled = false;

// start keeping the tagtree.urls dictionary up to date.
// Should only be called when the browser has been finished (which is the
// case when the links are loaded and the tagtree is started).
tagtree.start = function () {
	if (tagtree.enabled) {
		console.error('Tagtree started twice');
		return;
	}
	tagtree.enabled = true;
	tagtree.urls = {}; // dictionary: url => list of bookmarks
	tagtree.importUrls(browser.bookmarks);
}

tagtree.importUrls = function (folder) {
	var url;
	for (url in folder.bm) {
		tagtree.importBookmark(folder.bm[url]);
	}
	var title;
	for (title in folder.f) {
		tagtree.importUrls(folder.f[title]);
	}
}

tagtree.importBookmark = function (bm) {
	if (!tagtree.urls[bm.url]) {
		tagtree.urls[bm.url] = {url: bm.url, bm: []};
	}
	tagtree.urls[bm.url].bm.push(bm);
}

tagtree.stop = function () {
	if (!tagtree.enabled) {
		console.error('Tagtree stopped twice');
		return;
	}
	tagtree.enabled = false;
	delete tagtree.urls;
}

tagtree.addLink = function (link) {
	tagStructuredWebLinks.push(link);

	// just added a link, so should start now
	if (tagStructuredWebLinks.length == 1) {
		tagtree.start();
	}
}

tagtree.removeLink = function (link) {
	Array_remove(tagStructuredWebLinks, link);

	if (tagStructuredWebLinks.length == 0) {
		tagtree.stop();
	}
}

