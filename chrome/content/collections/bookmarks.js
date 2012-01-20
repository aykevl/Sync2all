
function NodeBase (link, data) {
	if (!(link instanceof Link)) throw 'not a real link';

	if (link instanceof TreeBasedLink) {
		if (!data.id) {
			console.error(data);
			throw 'No id in bookmark folder';
		}
		this.id = data.id;
	}
}

NodeBase.prototype.__defineGetter__('link', function () {
	return this.parentNode.link;
});

NodeBase.prototype.__defineGetter__('rootNode', function () {
	return this.parentNode.rootNode;
});

function Folder(link, data) {
	NodeBase.call(this, link, data);
	if (!data.title) {
		if (!(this instanceof BookmarkRootFolder)) {
			console.error(data);
			throw 'No title in bookmark folder';
		}
	} else {
		this.title = data.title;
	}
}
Folder.prototype.__proto__ = NodeBase.prototype;

function Bookmark (link, data) {
	NodeBase.call(this, link, data);
	if (!data.url) {
		console.error(data);
		throw 'Not a valid bookmark';
	}
	this.url = data.url;
	// title is not required
	if (data.title) this.title = data.title;
	if (data.mtime) this.mtime = data.mtime;
}
Bookmark.prototype.__proto__ = NodeBase.prototype;

function BookmarkFolder (link, data) {
	Folder.call(this, link, data);

	this.bm = {};
	this.f  = {};
}
BookmarkFolder.prototype.__proto__ = Folder.prototype;

BookmarkFolder.prototype.newBookmark = function (data) {
	var bookmark = new Bookmark(this.link, data);
	this.import(bookmark);
	return bookmark;
}

BookmarkFolder.prototype.newFolder = function (data) {
	var folder = new BookmarkFolder(this.link, data);
	this.import(folder);
	return folder;
}

BookmarkFolder.prototype.import = function (node) {
	node.parentNode = this;
	if (this.link instanceof TreeBasedLink) {
		this.rootNode.ids[node.id] = node;
	}
	if (node instanceof BookmarkFolder) { // NOT bookmarksFolderBase, root folders may not be added
		if (this.f[node.title])
			throw 'TODO merge duplicates';
		this.f[node.title] = node;
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
		console.error(node);
		throw 'unknown type';
	}
}

BookmarkFolder.prototype.addBookmark = function (link, data) {
	var bookmark = new Bookmark(this.link, data);
	this.add(link, bookmark);
	return bookmark;
}

BookmarkFolder.prototype.addFolder = function (link, data) {
	var folder = new BookmarkFolder(this.link, data);
	this.add(link, folder);
	return folder;
}

BookmarkFolder.prototype.add = function (link, node) {
	this.import(node);
	if (node instanceof Bookmark) {
		broadcastMessage('bm_add', link, [node]);
	} else if (node instanceof BookmarkFolder) {
		broadcastMessage('f_add', link, [node]);
	}
}

BookmarkFolder.prototype.remove = function (link, node) {
	delete node.parentNode;
	if (this.link instanceof TreeBasedLink) {
		delete this.rootNode.ids[node.id];
	}
	if (node instanceof BookmarkFolder) {
		if (this.f[node.title] != node)
			throw 'Removing a folder that wasn\'t added';
		delete this.f[node.title];
		broadcastMessage('f_del', link, [node]);
	} else if (node instanceof Bookmark) {
		if (this.bm[node.url] != node)
			throw 'Removing a bookmark that wasn\'t added';
		delete this.bm[node.url];
		broadcastMessage('bm_del', link, [node]);
	} else {
		console.error(node, this);
		throw 'unknown type';
	}
}

/* Special folder that only contains other data but doesn't have properties
 * itself
 */
function BookmarkCollection (link, data) {
	BookmarkFolder.call(this, link, data);

	this.ids = {};
	if (this.id) {
		this.ids[this.id] = this;
	}

	this._link = link;
}
BookmarkCollection.prototype.__proto__ = BookmarkFolder.prototype;

BookmarkCollection.prototype.__defineGetter__('link', function () {
	return this._link;
});

BookmarkCollection.prototype.__defineGetter__('rootNode', function () {
	return this;
});

