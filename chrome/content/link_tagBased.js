'use strict';

// import a single-url, tagged bookmark (without a tree)
// I'm not very happy with this name, but couldn't find a better one
function TagBasedLink (id) {
	this.id = id;

	this.flag_tagStructure = true;

	import_link(this);
}

TagBasedLink.prototype.importBookmark = function (uBm) {
	if (!tagtree.urls[uBm.url]) {
		// new bookmark (only sometimes the case)
		tagtree.urls[uBm.url] = {url: uBm.url, bm: []}
	}
	tagtree.urls[uBm.url][this.id+'_id'] = uBm[this.id+'_id'];

	for (var tagIndex=0; tagIndex<uBm.tags.length; tagIndex++) {
		var tag = uBm.tags[tagIndex];
		var parentNode = undefined;
		if (tag == this.rootNodeLabel) {
			parentNode = this.bookmarks;
		} else {
			if (!this.tags[tag]) {
				// Add the new folder to the list
				var folderNameList = tag.split(this.folderSep);
				parentNode = this.bookmarks;
				var folderName;
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
				this.tags[tag] = parentNode;
			} else {
				parentNode = this.tags[tag];
			}
		}
		var bookmark = this.copyBookmark(uBm);
		bookmark.parentNode = parentNode;
		parentNode.bm[bookmark.url] = bookmark;
	}
	if (!uBm.tags.length) {
		// this bookmark has no labels, add it to root
		var bookmark = this.copyBookmark(uBm);
		bookmark.parentNode = this.bookmarks;
		this.bookmarks.bm[bookmark.url] = bookmark;
	}
}

TagBasedLink.prototype.bm_add = function (callingLink, bm) {
	this.changed[bm.url] = bm;
	if (this.fixBookmark) {
		this.fixBookmark(bm);
	}
}

TagBasedLink.prototype.bm_del = function (callingLink, bookmark) {
	// already removed by tagtree, only has to be uploaded
	this.changed[bookmark.url] = bookmark;
}

// Not needed, empty folders aren't supported by tag-based links
TagBasedLink.prototype.f_add = false; // ??? FIXME is called multiple times under normal operation when it doesn't need to?

// delete a bookmarks tree
TagBasedLink.prototype.f_del = function (callingLink, folder) {
	var url;
	for (url in folder.bm) {
		this.bm_del(callingLink, folder.bm[url]);
	}
	var title;
	for (title in folder.f) {
		this.f_del(callingLink, folder.f[title]);
	}
};

TagBasedLink.prototype.bm_mv = function (callingLink, bookmark, oldParent) {
	this.changed[bookmark.url] = bookmark;
}

TagBasedLink.prototype.f_mv = function (callingLink, folder, oldParent) {
	this.markFolderChanged(folder); // FIXME there is a better way, see below, but it doesn't work. Make it work.
	//var oldlabel = oldParent == sync2all.bookmarks ? folder.title : gbm.folder_get_label(oldParent)+gbm.folderSep+folder.title;
	//var labels = oldlabel+','+gbm.folder_get_label(folder);
	//gbm.add_to_queue({op: 'modlabel', labels: labels});
};

TagBasedLink.prototype.bm_mod_url = function (callingLink, bm, oldurl) {
	this.fixBookmark(bm);

	gbm.changed[oldurl] = gbm.changed[oldurl] || tagtree.urls[oldurl].bm[0] || false; // choose one at random
};

TagBasedLink.prototype.bm_mod_title = function (callingLink, bm, oldtitle) {
	this.fixBookmark(bm);
	this.changed[bm.url] = bm;
};

// title changed
TagBasedLink.prototype.f_mod_title = function (callingLink, folder, oldtitle) {
	this.markFolderChanged(folder);
};

TagBasedLink.prototype.markFolderChanged = function (folder) {
	var url;
	for (url in folder.bm) {
		this.changed[url] = folder.bm[url];
	}
	var title;
	for (title in folder.f) {
		this.markFolderChanged(folder.f[title]);
	}
};

TagBasedLink.prototype.folder_get_label = function (folder) {
	if (!folder.parentNode) return this.rootNodeLabel;
	var label = '';
	while (true) {
		label = folder.title+(label.length?this.folderSep:'')+label;
		folder = folder.parentNode;
		if (!folder || !folder.parentNode) break; // first check introduced for bug when a bookmark is added to the Bookmarks Bar.
	}
	return label;
}
