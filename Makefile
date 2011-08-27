



all:
	/usr/lib/xulrunner-2.0/xpidl -m typelib -I /home/ayke/projects/libreoffice/clone/libs-extern-sys/moz/unxlngx6.pro/misc/build/mozilla/xpcom/base/ -w -v -e components/nsISync2allService.xpt components/nsISync2allService.idl

package:
	touch ../Sync2all.crx
	rm ../Sync2all.crx
	touch ../Sync2all.xpi
	rm ../Sync2all.xpi
	zip -r ../Sync2all.crx ./*
	cp ../Sync2all.crx ../Sync2all.xpi
