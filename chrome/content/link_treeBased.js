'use strict';

function TreeBasedLink (id) {
	Link.call(this, id);
	this.flag_treeStructure = true;
	import_treeBasedLink(this, id);
}

// import bookmark into own tree, thereby cleaning up duplicates etc.
TreeBasedLink.prototype.importBookmark = function (idIndex, bookmark) {
	// this is the folder where the bookmark is in.
	var parentNode = bookmark.parentNode;

	// check for invalid bookmark
	if (!bookmark.url)
		return true; // invalid, not added

	// check for duplicate
	if (parentNode.bm[bookmark.url]) {
		console.log('DUPLICATE: '+bookmark.url);
		console.log(bookmark);

		// this bookmark does already exist, take the latest.
		var otherBookmark = parentNode.bm[bookmark.url];

		if (otherBookmark.mtime > bookmark.mtime) {
			// otherBookmark is the latest added, so remove this bookmark
			this.bm_del(this, bookmark);
			// other bookmark is already added to the tree
			return true; // invalid bookmark
		} else {
			// this bookmark is the newest, remove the other
			this.bm_del(this, otherBookmark);
			parentNode.bm[bookmark.url] = bookmark; // replace the other bookmark
		}

	} else {
		// no duplicate, so just add
		parentNode.bm[bookmark.url] = bookmark;
	}

	// add bookmark ID
	if (this == browser) {
		idIndex[bookmark.id] = bookmark;
	} else {
		idIndex[bookmark[this.id+'_id']] = bookmark;
	}
}

// import folder, cleans up duplicates too
TreeBasedLink.prototype.importFolder = function (idIndex, folder) {
	var parentNode = folder.parentNode;

	// ignore folders without a title
	if (folder.title === '') {
		return;
	}

	// check for duplicates
	if (parentNode.f[folder.title]) {
		// duplicate folder, merge the contents
		console.log('DUPLICATE FOLDER: '+folder.title);
		console.log(folder);

		// get the other folder of which this is a duplicate
		var otherFolder = parentNode.f[folder.title];
		// move the contents of this folder to the other folder
		// FIXME check for duplicates (by using importFolder and importBookmark)
		var title; // first the subfolders
		for (title in folder.f) {
			var subFolder = folder.f[title];
			_mvFolder(subFolder, otherFolder);
			this.f_mv(this, subFolder, folder);
		}
		var url; // now move the bookmarks
		for (url in folder.bm) {
			// get bookmark
			var bookmark = folder.bm[url];
			// move bookmark
			bookmark.parentNode = otherFolder;
			delete folder.bm[bookmark.url];
			this.importBookmark(idIndex, bookmark);
			// move bookmark on web storage / in the browser
			this.bm_mv(this, bookmark, folder);
		}

		// now delete this folder. This removes it's contents too!
		// But that should not be a problem, as the contents has already
		// been moved.
		this.f_del(this, folder);
	}

	// merge it in the tree
	parentNode.f[folder.title] = folder;

	// add folder ID
	if (this == browser) {
		idIndex[folder.id] = folder;
	} else {
		idIndex[folder[this.id+'_id']] = folder;
	}
}
