
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
		console.trace();
		return; // avoid more errors
	}
	this.unlink();
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

NodeBase.prototype.testfail = function (error, element) {
	console.error(this, element);
	throw (this.link.fullName || this.link.name)+' Failed test: '+error;
}

NodeBase.prototype.isInMoveQueue = function (other_parent) {
	// don't touch nodes that will be moved
	if (this.id in this        .rootNode.moved ||
		this.id in other_parent.rootNode.moved) {
		return true;
	}
	return false;
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

Bookmark.prototype.toString = function () {
	return this.url;
}

Bookmark.prototype.getOther = function (other_parent) {
	return other_parent.bm[this.url];
}

Bookmark.prototype.unlink = function () {
	if (this.rootNode.ids) {
		delete this.rootNode.ids[this.id];
	}
	var other = this.parentNode.bm[this.url];
	if (other && other != this) {
		console.error(this);
		throw 'Removing a bookmark that wasn\'t added';
	}
	delete this.parentNode.bm[this.url];
	//delete this.parentNode; // also cuts off connection with link
}
Bookmark.prototype.remove = function (link) {
	console.log('Removed bookmark:', this, this.url);
	this.rootNode.deleted[this.id] = true;
	this.unlink(); // cuts the connection with the rest of the tree
	// the following check works because:
	//  * events during merge are fired from sync2all.bookmarks
	//    (browser bookmarks)
	//  * events from the browser are... from the browser and are thus fired
	//    from sync2all.bookmarks
	// So, if links want to push changes after the start/restart (Chrome Sync?),
	// they should fire them from the browser too (which they should do
	// anyway because their own bookmarks tree might be broken after the merge)
	if (this.link instanceof Browser) {
		broadcastMessage('bm_del', link, [this]);
	} else {
		this.link.bm_del(link, this);
	}
}

Bookmark.prototype.moveTo = function (link, newParent) {
	console.log('bookmark move:', this, link.id, newParent);
	this.rootNode.moved[this.id] = true;
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

Bookmark.prototype.setUrl = function (link, newUrl) {
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
		this.parentNode.bm[newUrl].remove(link);
	}

	// add new reference
	this.parentNode.bm[newUrl] = this;

	// report changes
	console.log('Url of '+this.title+' changed from '+this.url+' to '+newUrl);
	broadcastMessage('bm_mod_url', link, [this, oldUrl]);
}


Bookmark.prototype.importInLink = function (link) {
	link.bm_add(undefined, this);
}

Bookmark.prototype.broadcastAdded = function (link) {
	broadcastMessage('bm_add', link, [this]);
}
Bookmark.prototype.markAdded = function (link) {
	this.link.bm_add(link, this);
}
Bookmark.prototype.markMoved = function (link, oldParent) {
	this.link.bm_mv(link, this, oldParent);
}

Bookmark.prototype.getTreelessLabels = function (link) {
	if (!tagtree.urls[this.url]) {
		console.error(this);
		throw 'unknown tagtree.urls[this.url]';
	}
	if (tagtree.urls[this.url].bm.length == 0) {
		// no labels
		return false;
	}
	var folder;
	var uBm;
	var tags = [];
	for (var i=0; uBm=tagtree.urls[this.url].bm[i]; i++) {
		var folder = uBm.parentNode;
		if (!folder) {
			console.error(uBm);
			throw 'no parentNode';
		}
		var tag = folder.getTreelessLabel(link);;
		tags.push(tag);
	}
	if (tags.length == 1 && tags[0] == link.rootNodeLabel) {
		tags = [];
	}
	return tags;
}

function BookmarkFolder (link, data) {
	Folder.call(this, link, data);

	this.bm = {};
	this.f  = {};
}
BookmarkFolder.prototype.__proto__ = Folder.prototype;

BookmarkFolder.prototype.toString = function () {
	return this.title;
}

BookmarkFolder.prototype.getOther = function (other_parent) {
	return other_parent.f[this.title];
}

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

BookmarkFolder.prototype.getTreelessLabel = function (link) {
	if (!this.parentNode || this == sync2all.bookmarks)
		return link.rootNodeLabel;
	var label = '';
	var folder = this;
	while (true) {
		label = folder.title+(label.length?link.folderSep:'')+label;
		folder = folder.parentNode;
		if (!folder || !folder.parentNode) break; // first check introduced for bug when a bookmark is added to the Bookmarks Bar.
	}
	return label;
}

BookmarkFolder.prototype.importFolder = function (data) {
	var folder = new BookmarkFolder(this.link, data);
	this._import(folder);
	return folder;
}

BookmarkFolder.prototype._import = function (node) {
	/*if (node.parentNode) {
		console.error(node, this);
		throw 'Node has already a parent';
	}*/ // TODO
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

		node.parentNode = this;

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
			otherNode.remove();
		}

		// now there are no duplicates (a possible duplicate has already been removed)
		this.f[node.title] = node;

	} else if (node instanceof Bookmark) {
		// check for duplicate
		if (this.bm[node.url]) {
			// this bookmark does already exist, take the latest.
			var otherNode = this.bm[node.url];

			console.log('DUPLICATE: '+node.url, node, otherNode);

			if (otherNode.mtime > node.mtime) {
				// otherBookmark is the latest added, so remove this bookmark
				// it isn't linked with the tree, so may be low-level removed
				node.remove();
				// other bookmark is already added to the tree
				return true; // invalid bookmark
			} else {
				// this bookmark is the newest, remove the other
				otherNode.remove();
				node.parentNode = this;
				this.bm[node.url] = node; // replace the other bookmark
			}
		} else {
			// no duplicate, so just add
			node.parentNode = this;
			this.bm[node.url] = node;
		}
	} else {
		console.error(node, this);
		throw 'unknown type';
	}
}

BookmarkFolder.prototype.add = function (link, node) {
	console.log('New node: ', node.url||node.title, node);
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

BookmarkFolder.prototype.unlink = function () {
	if (this.rootNode.ids) {
		delete this.rootNode.ids[this.id];
	}
	if (this.parentNode.f[this.title] != this)
		throw 'Removing a folder that wasn\'t added';
	delete this.parentNode.f[this.title];
	//delete this.parentNode; // also cuts of connection with link
}
BookmarkFolder.prototype.remove = function (link) {
	console.log('Removed folder:', this, this.title);
	this.rootNode.deleted[this.id] = true;
	this.unlink();
	if (this.link instanceof Browser) {
		broadcastMessage('f_del', link, [this]);
	} else {
		this.link.f_del(link, this);
	}
}

BookmarkFolder.prototype.moveTo = function (link, newParent) {
	console.log('folder move:', this, link.id, newParent);
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

BookmarkFolder.prototype.forEach = function (callback, param) {
	for (var title in this.f) {
		var node = this.f[title];
		callback(node, param);
	}
	for (var url in this.bm) {
		var node = this.bm[url];
		callback(node, param);
	}
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

BookmarkFolder.prototype.mergeWith = function (other) {

	// first, apply the actions (if available)
	this.forEach(function (this_node, other) {
		if (this_node.id in other.rootNode.deleted) {
			this_node.remove(other.link);
		} else if (this_node.id in this.rootNode.moved) {
			var other_node = other.rootNode.ids[this_node.id];

			// do normal merge stuff here (as it will not be done normally)
			this_node.copyPropertiesFrom(other_node);
			if (this_node instanceof BookmarkFolder) {
				this_node.mergeWith(other_node);
			}

			if (other_node.parentNode == this) {
				// node hasn't been moved
				// TODO this check shouldn't be here, but in the links
				return;
			}

			// do the actual move
			var oldParent = other_node.parentNode;
			other_node._moveTo(other);
			other_node.markMoved(this.link, oldParent);
		}
	}.bind(this), other);

	other.forEach(function (other_node, other) {
		if (other_node.id in this.rootNode.deleted) {
			other_node.remove();
		} else if (other_node.id in other.rootNode.moved) {
			var this_node = this.rootNode.ids[other_node.id];

			// do merge stuff
			this_node.copyPropertiesFrom(other_node);
			if (this_node instanceof BookmarkFolder) {
				this_node.mergeWith(other_node);
			}

			// whether this node hasn't been moved at all
			if (this_node.parentNode == this) {
				// TODO this check shouldn't be here, but in the links
				return;
			}

			// do the actual move
			this_node.moveTo(other.link, this);
		}
	}.bind(this), other);

	// then, copy the new nodes (once the old ones have been removed) and
	// merge the changed nodes
	this.forEach(function (this_node, other) {
		var other_node = this_node.getOther(other); // may not exist

		// don't touch nodes that will be moved
		if (this_node.isInMoveQueue(other))
			return;

		if (!other_node) {
			console.log('New node: '+this_node.toString(), this_node);
			this_node.importInLink(other.link);
		}
	}.bind(this), other);

	// other may be out of sync after this action, but that doesn't matter as
	// this is the last ting to do.
	other.forEach(function (other_node, other) {
		var this_node  = other_node.getOther(this); // may not exist

		if (other_node.isInMoveQueue(other))
			return;

		if (!this_node) {
			// WARNING: this makes 'other' invalid (doesn't harm because it
			// will be discarded anyway)
			other_node.unlink();
			this.add(other.link, other_node);
		} else {
			this_node.copyPropertiesFrom(other_node);
			// TODO merge changes (changed title etc.)
			if (this_node instanceof BookmarkFolder) {
				this_node.mergeWith(other_node);
			}
		}
	}.bind(this), other);
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


/* Root bookmark folder
 */
function BookmarkCollection (link, data) {
	this.ids = {};
	this.deleted = {};
	this.moved   = {};
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

