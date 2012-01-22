
function NodeBase (link, data) {
	if (!(link instanceof Link)) throw 'not a real link';

	if (link instanceof TreeBasedLink && !this.ids) {
		if (!data.id) {
			console.error(data);
			throw 'No id in bookmark/folder';
		}
	}
	if (link instanceof Browser) {
		this.id = data.id;
	} else if (link instanceof TreeBasedLink) {
		this[link.id+'_id'] = data.id;
	} else if (link instanceof TagBasedLink) {
		// do nothing for now
	} else {
		throw 'unknown link type';
	}
	if (data.title) this.title = data.title;
	if (data.mtime) this.mtime = data.mtime;
}

NodeBase.prototype.__defineGetter__('link', function () {
	return this.parentNode.link;
});

NodeBase.prototype.__defineGetter__('rootNode', function () {
	return this.parentNode.rootNode;
});

NodeBase.prototype._moveTo = function (newParent) {
	this._remove();
	newParent._import(this);
}

function Folder(link, data) {
	NodeBase.call(this, link, data);
}
Folder.prototype.__proto__ = NodeBase.prototype;

function Bookmark (link, data) {
	NodeBase.call(this, link, data);
	if (!data.url) {
		console.error(data);
		throw 'Not a valid bookmark';
	}
	this.url = data.url;
}
Bookmark.prototype.__proto__ = NodeBase.prototype;

Bookmark.prototype._remove = function () {
	if (this.rootNode.ids) {
		delete this.rootNode.ids[this.id];
	}
	if (this.parentNode.bm[this.url] != this)
		throw 'Removing a bookmark that wasn\'t added';
	delete this.parentNode.bm[this.url];
	delete this.parentNode; // also cuts of connection with link
}
Bookmark.prototype.remove = function (link) {
	this._remove();
	broadcastMessage('bm_del', link, [this]);
}
Bookmark.prototype.moveTo = function (link, newParent) {
	this._moveTo(newParent);
	broadcastMessage('bm_mv', link, [this, newParent]);
}

Bookmark.prototype._setTitle = function (newTitle) {
	this.title = newTitle;
}
Bookmark.prototype.setTitle = function (link, newTitle) {
	var oldTitle = this.title;
	this._setTitle(newTitle);
	console.log('Title of url '+this.url+' changed from '+oldTitle+' to '+newTitle);
	broadcastMessage('bm_mod_title', link, [this, oldTitle]);
}

Bookmark.prototype._setUrl = function (newUrl) {
	var oldUrl = this.url;

	// delete old reference
	delete this.parentNode.bm[this.url];
	// change url
	this.url = newUrl;

	// does that url already exist?
	if (this.parentNode.bm[newUrl]) {
		console.log('"Duplicate URL '+newUrl+', merging by removing other.');
		this.parentNode.bm[newUrl].remove();
	}

	// add new reference
	this.parentNode.bm[newUrl] = this;
}
Bookmark.prototype.setUrl = function (link, newUrl) {
	var oldUrl = this.url;
	this._setUrl(newUrl);
	console.log('Url of '+this.title+' changed from '+this.url+' to '+newUrl);
	broadcastMessage('bm_mod_url', link, [this, oldUrl]);
}

function BookmarkFolder (link, data) {
	Folder.call(this, link, data);

	this.bm = {};
	this.f  = {};
}
BookmarkFolder.prototype.__proto__ = Folder.prototype;

BookmarkFolder.prototype.importBookmark = function (data) {
	var bookmark = new Bookmark(this.link, data);
	this._import(bookmark);
	return bookmark;
}

BookmarkFolder.prototype.importFolder = function (data) {
	var folder = new BookmarkFolder(this.link, data);
	this._import(folder);
	return folder;
}

BookmarkFolder.prototype._import = function (node) {
	if (node.parentNode) {
		console.error(node, this);
		throw 'Node has already a parent';
	}
	node.parentNode = this;
	if (this.rootNode.ids) {
		if (this.link instanceof Browser) {
			this.rootNode.ids[node.id] = node;
		} else {
			this.rootNode.ids[node[this.link.id+'_id']] = node;
		}
	}
	if (node instanceof BookmarkFolder) {
		if (!node.title) {
			console.error(node, this);
			throw '!node.title';
		}
		// check for duplicates
		if (this.f[node.title]) {
			// duplicate folder, merge contents

			// get the folder of which this is a duplicate
			var otherNode = this.f[node.title];

			console.log('DUPLICATE FOLDER: '+otherNode.title, otherNode);

			// move the contents of the other folder (otherNode) to this folder (node)
			// TODO make it possible to first import items inside a folder and then
			// import it into the parent, so the contents of the folders can also be
			// moved the other way round.
			var title; // first the subfolders
			for (title in otherNode.f) {
				otherNode.f[title]._moveTo(node);
			}
			var url; // now move the bookmarks
			for (url in otherNode.bm) {
				otherNode.bm[url]._moveTo(node);
			}

			// now delete this folder. This removes it's contents too!
			// But that should not be a problem, as the contents has already
			// been moved.
			this.link.f_del(this.link, otherNode);
		} else {
			// no duplicate
			this.f[node.title] = node;
		}
	} else if (node instanceof Bookmark) {
		// check for duplicate
		if (this.bm[node.url]) {
			// this bookmark does already exist, take the latest.
			var otherNode = this.bm[node.url];

			console.log('DUPLICATE: '+node.url, node, otherNode);

			if (otherNode.mtime > node.mtime) {
				// otherBookmark is the latest added, so remove this bookmark
				this.link.bm_del(this.link, node);
				// other bookmark is already added to the tree
				return true; // invalid bookmark
			} else {
				// this bookmark is the newest, remove the other
				this.link.bm_del(this.link, otherNode);
				this.bm[node.url] = node; // replace the other bookmark
			}
		} else {
			// no duplicate, so just add
			this.bm[node.url] = node;
		}
	} else {
		console.error(node, this);
		throw 'unknown type';
	}
}

BookmarkFolder.prototype.add = function (link, node) {
	this._import(node);
	if (node instanceof Bookmark) {
		broadcastMessage('bm_add', link, [node]);
	} else if (node instanceof BookmarkFolder) {
		broadcastMessage('f_add', link, [node]);
	} else {
		console.error(node);
		throw 'unknown type';
	}
}

BookmarkFolder.prototype.newBookmark = function (link, data) {
	var bookmark = new Bookmark(this.link, data);
	this.add(link, bookmark);
	return bookmark;
}

BookmarkFolder.prototype.newFolder = function (link, data) {
	var folder = new BookmarkFolder(this.link, data);
	this.add(link, folder);
	return folder;
}

BookmarkFolder.prototype._remove = function () {
	if (this.rootNode.ids) {
		delete this.rootNode.ids[this.id];
	}
	if (this.parentNode.f[this.title] != this)
		throw 'Removing a folder that wasn\'t added';
	delete this.parentNode.f[this.title];
	delete this.parentNode; // also cuts of connection with link
}
BookmarkFolder.prototype.remove = function (link) {
	this._remove();
	broadcastMessage('f_del', link, [this]);
}

BookmarkFolder.prototype.moveTo = function (link, newParent) {
	this._moveTo(newParent);
	broadcastMessage('f_mv', link, [this, newParent]);
}

BookmarkFolder.prototype._setTitle = function (newTitle) {
	var oldTitle = this.title;
	this.title = newTitle;
	delete this.parentNode.f[oldTitle];
	this.parentNode.f[newTitle] = this;
}
BookmarkFolder.prototype.setTitle = function (link, newTitle) {
	if (typeof newTitle != 'string' && !newTitle) {
		console.error(this, newTitle);
		throw 'invalid title';
	}
	var oldTitle = this.title;
	this._setTitle(newTitle);
	broadcastMessage('f_mod_title', link, [this, oldTitle]);
}

/* Special folder that only contains other data but doesn't have properties
 * itself
 */
function BookmarkCollection (link, data) {
	this.ids = {};
	BookmarkFolder.call(this, link, data);

	if (this.id) this.ids[this.id] = this;

	this._link = link;
}
BookmarkCollection.prototype.__proto__ = BookmarkFolder.prototype;

BookmarkCollection.prototype.__defineGetter__('link', function () {
	return this._link;
});

BookmarkCollection.prototype.__defineGetter__('rootNode', function () {
	return this;
});

