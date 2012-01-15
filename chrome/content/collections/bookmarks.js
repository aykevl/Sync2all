
function DataTypeBase (link, data) {
	if (!(link instanceof Link)) throw 'not a real link';

	if (link instanceof TreeBasedLink) {
		if (!data.id) {
			console.error(data);
			throw 'No id in bookmark folder';
		}
		this.id = data.id;
	}
}

function Bookmark (link, data) {
	DataTypeBase.call(this, link, data);
	if (!data.url) {
		console.error(data);
		throw 'Not a bookmark';
	}
	this.url = data.url;
	// title is not required
	if (data.title) this.title = data.title;
	if (data.mtime) this.mtime = data.mtime;
}
Bookmark.prototype.__proto__ = DataTypeBase.prototype;

function BookmarkFolderBase (link, data) {
	DataTypeBase.call(this, link, data);

	this.bm = {};
	this.f  = {};
}
BookmarkFolderBase.prototype.__proto__ = DataTypeBase.prototype;

BookmarkFolderBase.prototype.add = function (link, node) {
	node.parentNode = this;
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
				link.bm_del(link, node);
				// other bookmark is already added to the tree
				return true; // invalid bookmark
			} else {
				// this bookmark is the newest, remove the other
				link.bm_del(link, otherNode);
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

function BookmarkFolder (link, data) {
	BookmarkFolderBase.call(this, link, data);

	if (!data.title) {
		console.error(data);
		throw 'No title in bookmark folder';
	}
	this.title = data.title;
}
BookmarkFolder.prototype.__proto__ = BookmarkFolderBase.prototype;

/* Special folder that only contains other data but doesn't have properties
 * itself
 */
function BookmarkRootFolder (link, data) {
	BookmarkFolderBase.call(this, link, data);

	this.link = link;
}
BookmarkRootFolder.prototype.__proto__ = BookmarkFolderBase.prototype;
