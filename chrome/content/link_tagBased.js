
import_tagBasedLink = function (link) {
	link.flag_tagStructure = true;
	import_link(link);

	// import a single-url, tagged bookmark (without a tree)
	// I'm not very happy with this name, but couldn't find a better one
	link.importBookmark = function (uBm) {
		if (!tagtree.urls[uBm.url]) {
			// new bookmark (only sometimes the case)
			tagtree.urls[uBm.url] = {url: uBm.url, bm: []}
		}
		tagtree.urls[uBm.url][link.id+'_id'] = uBm[link.id+'_id'];

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
			var bookmark = link.copyBookmark(uBm);
			bookmark.parentNode = parentNode;
			parentNode.bm[bookmark.url] = bookmark;
		}
		if (!uBm.tags.length) {
			// this bookmark has no labels, add it to root
			var bookmark = link.copyBookmark(uBm);
			bookmark.parentNode = link.bookmarks;
			link.bookmarks.bm[bookmark.url] = bookmark;
		}
	}

	link.bm_add = function (callingLink, bm) {
		link.changed[bm.url] = bm;
		if (link.fixBookmark) {
			link.fixBookmark(bm);
		}
	}

	link.bm_del = function (callingLink, bookmark) {
		// already removed by tagtree, only has to be uploaded
		link.changed[bookmark.url] = bookmark;
	}

	// Not needed, empty folders aren't supported by tag-based links
	link.f_add = false; // ??? FIXME is called multiple times under normal operation when it doesn't need to?

	// delete a bookmarks tree
	link.f_del = function (callingLink, folder) {
		var url;
		for (url in folder.bm) {
			link.bm_del(callingLink, folder.bm[url]);
		}
		var title;
		for (title in folder.f) {
			link.f_del(callingLink, folder.f[title]);
		}
	};

	link.bm_mv = function (callingLink, bookmark, oldParent) {
		link.changed[bookmark.url] = bookmark;
	}

	link.f_mv = function (callingLink, folder, oldParent) {
		link.markFolderChanged(folder); // FIXME there is a better way, see below, but it doesn't work. Make it work.
		//var oldlabel = oldParent == browser.bookmarks ? folder.title : gbm.folder_get_label(oldParent)+gbm.folderSep+folder.title;
		//var labels = oldlabel+','+gbm.folder_get_label(folder);
		//gbm.add_to_queue({op: 'modlabel', labels: labels});
	};

	link.bm_mod_url = function (callingLink, bm, oldurl) {
		link.fixBookmark(bm);

		gbm.changed[oldurl] = gbm.changed[oldurl] || oldgbookmark.bm[0]; // choose one at random
	};

	link.bm_mod_title = function (callingLink, bm, oldtitle) {
		link.fixBookmark(bm);
		link.changed[bm.url] = bm;
	};

	// title changed
	link.f_mod_title = function (callingLink, folder, oldtitle) {
		link.markFolderChanged(folder);
	};

	link.markFolderChanged = function (folder) {
		var url;
		for (url in folder.bm) {
			link.changed[url] = folder.bm[url];
		}
		var title;
		for (title in folder.f) {
			link.markFolderChanged(folder.f[title]);
		}
	};

	link.folder_get_label = function (folder) {
		if (!folder.parentNode) return link.rootNodeLabel;
		var label = '';
		while (true) {
			label = folder.title+(label.length?link.folderSep:'')+label;
			folder = folder.parentNode;
			if (!folder || !folder.parentNode) break; // first check introduced for bug when a bookmark is added to the Bookmarks Bar.
		}
		return label;
	}
}
