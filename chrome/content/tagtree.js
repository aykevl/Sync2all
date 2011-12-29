
/* Code to make it easier to work with tagged structures, by moving part of the
 * work to a separate file.
 */

tagtree = {};
tagtree.name = 'tagtree';
tagtree.id = 'tagtree';

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
	messageListeners.unshift(tagtree); // insert as first
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
	Array_remove(messageListeners, tagtree);
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

tagtree.bm_add = function (callingLink, bookmark) {
	// add to tagtree.urls
	tagtree.importBookmark(bookmark);
};

tagtree.bm_del = function (callingLink, bookmark) {
	// delete this label
	Array_remove(tagtree.urls[bookmark.url].bm, bookmark);

	// TODO remove bookmark from list when it is removed from links?
}

tagtree.f_add = false;

// delete a bookmarks tree
tagtree.f_del = function (callingLink, folder) {
	var url;
	for (url in folder.bm) {
		tagtree.bm_del(callingLink, folder.bm[url]);
	}
	var title;
	for (title in folder.f) {
		tagtree.f_del(callingLink, folder.f[title]);
	}
};

tagtree.bm_mod_url = function (callingLink, bm, oldurl) {
	// remove the one, like tagtree.bm_del (unfortunately):
	Array_remove(tagtree.urls[oldurl].bm, bm);

	// add the other
	tagtree.bm_add(callingLink, bm);
}

// Moved bookmarks get automatically new labels (code for that is in the links)
// and those aren't in the scope of tagtree.
tagtree.bm_mv = false;
tagtree.f_mv = false;

// same for f_mod_title and bm_mod_title:
tagtree.f_mod_title = false;
tagtree.bm_mod_title = false;

// Messages to which I won't listen
tagtree.commit       = false;
tagtree.syncFinished = false;

