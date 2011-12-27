
import_tagBasedLink = function (link) {
	link.flag_tagStructure = true;
	import_link(link);

	// import a single-url, tagged bookmark (without a tree)
	// I'm not very happy with this name, but couldn't find a better one
	link.importBookmark = function (uBm) {
		if (!tagtree.urls[uBm.url]) {
			// new bookmark (only sometimes the case)
			tagtree.urls[uBm.url] = {gbm_id: uBm.id, url: uBm.url, bm: []}
		} else {
			// bookmark does already exist (most often the case)
			tagtree.urls[uBm.url].gbm_id = uBm.id;
		}

		for (var tagIndex=0; tagIndex<uBm.tags.length; tagIndex++) {
			var tag = uBm.tags[tagIndex];
			var parentNode = undefined;
			if (tag == link.rootNodeLabel) {
				parentNode = link.bookmarks;
			} else {
				if (!link.tags[tag]) {
					// Add the new folder to the list
					var folderNameList = tag.split(link.folderSep);
					parentNode = link.bookmarks;
					var folderNameList;
					for (var folderNameIndex=0; folderName=folderNameList[folderNameIndex]; folderNameIndex++) {
						// is this a new directory?
						if (parentNode.f[folderName] == undefined) {
							// yes, create it first
							parentNode.f[folderName] = {bm: {}, f: {}, title: folderName,
								parentNode: parentNode};
						}
						// parentNode does exist
						parentNode = parentNode.f[folderName];
					}
					link.tags[tag] = parentNode;
				} else {
					parentNode = link.tags[tag];
				}
			}
			var bookmark = {url: uBm.url, title: uBm.title, parentNode: parentNode,
				mtime: uBm.mtime};
			parentNode.bm[bookmark.url] = bookmark;
		}
		if (!uBm.tags.length) {
			// this bookmark has no labels, add it to root
			var bookmark = {url: uBm.url, title: uBm.title, parentNode: link.bookmarks,
				mtime: uBm.mtime};
			link.bookmarks.bm[bookmark.url] = bookmark;
		}
	}
}
