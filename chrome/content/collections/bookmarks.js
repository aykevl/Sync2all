
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
	if (this.parentNode == newParent) {
		console.warn('WARNING: node moved to it\'s parent folder!', this, newParent);
	}
	this._remove();
	newParent._import(this);
}

NodeBase.prototype.copyPropertiesFrom = function (other) {
	var key;
	for (key in other) {
		if (key == 'bm' || key == 'f' || key == 'parentNode') continue;
		if (this[key] === undefined) {
			this[key] = other[key];
		}
	}
};

NodeBase.prototype.selftest = function () {
	if (this.link instanceof Browser) {
		if (!this.id)
			this.link.testfail('!this.id', this);
		var webLink;
		for (var i=0; webLink=sync2all.syncedWebLinks[i]; i++) {
			if (!webLink.queue.running && !webLink.queue.length && !webLink.status) {
				if (webLink instanceof TreeBasedLink) {
					if (!this[webLink.id+'_id'] && !this.ids)
						this.testfail('!this.*_id', [this, webLink.id]);
				} else {
					if (this[webLink.id+'_id'])
						this.testfail('this.*_id', [this, webLink.id]);
				}
			}
		}
	} else {
		if (this.link instanceof TreeBasedLink) {
			if (!this[this.link.id+'_id'] && !this.ids)
				this.testfail('!this.*_id', this);
		} else {
			if (this[this.link.id+'_id'])
				this.testfail('this.*_id', this);
		}
	}
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

	if (!newUrl) {
		console.error(this);
		throw 'invalid url:'+newUrl;
	}

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


Bookmark.prototype.importInLink = function (link) {
	link.bm_add(undefined, this);
}

Bookmark.prototype.broadcastAdded = function (link) {
	broadcastMessage('bm_add', link, [this]);
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

BookmarkFolder.prototype.importTaggedBookmark = function (link, data) {
	if (!tagtree.urls[data.url]) {
		// new bookmark (only sometimes the case)
		tagtree.urls[data.url] = {url: data.url, bm: []}
	}
	tagtree.urls[data.url][link.id+'_id'] = data[link.id+'_id'];

	for (var tagIndex=0; tagIndex<data.tags.length; tagIndex++) {
		var tag = data.tags[tagIndex];
		var parentNode = undefined;
		if (tag == link.rootNodeLabel) {
			parentNode = this;
		} else {
			if (!link.tags[tag]) {
				// Add the new folder to the list
				var folderNameList = tag.split(link.folderSep);
				parentNode = this;
				var folderName;
				for (var folderNameIndex=0; folderName=folderNameList[folderNameIndex]; folderNameIndex++) {
					// is this a new directory?
					if (parentNode.f[folderName] == undefined) {
						// yes, create it first
						parentNode.importFolder({title: folderName,});
					}
					// parentNode does exist
					parentNode = parentNode.f[folderName];
				}
				link.tags[tag] = parentNode;
			} else {
				parentNode = link.tags[tag];
			}
		}
		parentNode.importBookmark(data);
	}
	if (!data.tags.length) {
		// this bookmark has no labels, add it to root
		this.importBookmark(data);
	}
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
		} else if (this.link instanceof TreeBasedLink) {
			this.rootNode.ids[node[this.link.id+'_id']] = node;
		} else {
			// no IDs to import
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
	node.broadcastAdded(link);
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

// whether this folder-node has contents (bookmarks or folders)
BookmarkFolder.prototype.hasContents = function () {
	var url;
	for (url in this.bm) {
		return true;
	}
	var title;
	for (title in this.f) {
		return true;
	}
	return false;
}

// 'local' represents 'remote'.
BookmarkFolder.prototype.mergeWith = function (link, other) {

	// merge properties
	this.copyPropertiesFrom(other);

	// unique local folders
	for (var title in this.f) {
		var this_subfolder  = this.f [title];
		var other_subfolder = other.f[title]; // may not exist

		if (!other_subfolder) {
			// unique folder/label
			console.log('Unique local folder: '+title, this_subfolder);
			this_subfolder.importInLink(link);

		} else {
			// other folder does exist, merge it too
			this_subfolder.mergeWith(link, other_subfolder);
		}
	}

	// resolve unique local bookmarks
	for (var url in this.bm) {
		var this_bookmark  = this.bm[url];
		var other_bookmark = other.bm[url];

		if (!other_bookmark) {
			// unique local bookmark
			console.log('New local bookmark: '+this_bookmark.url, this_bookmark);
			console.log(this_bookmark);
			console.log(this);
			this_bookmark.importInLink(link);

		} else {
			// TODO merge changes (changed title etc.)
		}
	}

	// find unique remote folders
	// After this action, other.f may be out of sync
	for (var title in other.f) {
		var other_subfolder = other.f[title];
		var this_subfolder  = this .f[title]; // may not exist

		// ignore bogus folders
		if (!other_subfolder.title || !other_subfolder.bm || !other_subfolder.f)
			continue;

		if (!this_subfolder) {
			// unique remote folder
			console.log('Unique remote folder', other_subfolder.title, other_subfolder);
			// this removes the node from link.bookmarks and imports it into this.f
			other_subfolder._remove();
			this.add(link, other_subfolder);
			//syncRFolder(link, other_subfolder, this);
		}
	}

	// find unique remote bookmarks
	// After this action, other.bm may be out of sync
	for (var url in other.bm) {
		var other_bookmark = other.bm[url];
		var this_bookmark  = this .bm[url]; // may not exist

		if (!this_bookmark) {
			// unique remote bookmark

			// log this
			console.log('New remote bookmark: '+other_bookmark.url, other_bookmark);

			// copy bookmark
			other_bookmark._remove(); // don't broadcast this change
			this.add(link, other_bookmark); // broadcast this change
		} else {
			this_bookmark.copyPropertiesFrom(other_bookmark);
		}
	}
}

// folder exists only locally
BookmarkFolder.prototype.importInLink = function (link) {
	// push this folder
	if (link.f_add !== false) link.f_add(undefined, this);

	// push subfolders
	for (var title in this.f) {
		this.f[title].importInLink(link);
	}

	// push bookmarks inside this folder
	for (var url in this.bm) {
		this.bm[url].importInLink(link);
	}
}

// folder exists only locally
BookmarkFolder.prototype.broadcastAdded = function (link) {
	// push this folder
	broadcastMessage('f_add', link, [this]);

	// push subfolders
	for (var title in this.f) {
		this.f[title].broadcastAdded(link);
	}

	// push bookmarks inside this folder
	for (var url in this.bm) {
		this.bm[url].broadcastAdded(link);
	}
}

BookmarkFolder.prototype.selftest = function () {
	NodeBase.prototype.selftest.call(this); // call superclass
	// test this folder
	if (this.f instanceof Array)
		this.testfail('this.f instanceof Array');
	if (this.bm instanceof Array)
		this.testfail('this.bm instanceof Array');

	// test bookmarks in this folder
	var url;
	for (url in this.bm) {
		var bm = this.bm[url];
		if (!bm.url == url)
			this.testfail('bm.url != folder.bm[url]', bm);
		if (bm.parentNode != this) {
			this.testfail('bm.parentNode != folder', bm);
		}
		bm.selftest();
	}

	// test subfolders
	var title;
	for (title in this.f) {
		var subfolder = this.f[title];
		if (subfolder.title != title)
			this.testfail('subfolder.title != title', subfolder);
		if (subfolder.parentNode != this)
			this.testfail('subfolder.parentNode != this', subfolder);
		subfolder.selftest();
	}
}

BookmarkFolder.prototype.testfail = function (error, element) {
	console.log(this, element);
	throw (this.link.fullName || this.link.name)+' Failed test: '+error;
}


/* Root bookmark folder
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

