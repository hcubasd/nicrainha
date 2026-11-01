// Writes public/engine/swiftlatexpdftex.js: SwiftLaTeX's pdfTeX worker with
// the showcase's patches. From the SwiftLaTeX release v20022022
// (https://github.com/SwiftLaTeX/SwiftLaTeX/releases/tag/v20022022), copy
// swiftlatexpdftex.wasm to public/engine/ as is, and run
//
//   node scripts/engine.mjs path/to/swiftlatexpdftex.js
//
// The patches:
//   1. fetched files are saved under their own names (SwiftLaTeX's server
//      names them with a header that static hosting doesn't send);
//   2. a compile's result carries TeX's .log file, not the console output;
//   3. "flushcache" replies when done;
//   4. a "preload" command installs files up front, as [[key, bytes], …]
//      with the engine's lookup keys "<kpathsea format>/<name>"; any other
//      file is fetched from the endpoint ("settexliveurl") when TeX first
//      asks for it, and whatever doesn't come back 200 is missing for good
//      (static hosting answers 404, where SwiftLaTeX's server answered 301).
//   5. each page TeX finishes, "[<n>" on its terminal, is posted as it
//      happens, { cmd: "progress", page: n }, while the compile runs.

import { readFileSync, writeFileSync } from "node:fs";

let source = readFileSync(process.argv[2], "utf8");
function patch(from, to) {
	if (source.split(from).length !== 2) throw new Error(`Expected exactly one: ${from}`);
	source = source.replace(from, () => to);
}

patch(
	'const fileid=xhr.getResponseHeader("fileid");const savepath=TEXCACHEROOT+"/"+fileid;',
	'const savepath=TEXCACHEROOT+"/"+reqname;',
);
patch(
	'const pkid=xhr.getResponseHeader("pkid");const savepath=TEXCACHEROOT+"/"+pkid;',
	'const savepath=TEXCACHEROOT+"/"+dpi+"-"+reqname;',
);
patch(
	"let status=_compileLaTeX();",
	'let status=_compileLaTeX();try{self.memlog=FS.readFile(WORKROOT+"/"+self.mainfile.replace(/\\.tex$/,"")+".log",{encoding:"utf8"})}catch(err){}',
);
patch(
	'else if(xhr.status===301){console.log("TexLive File not exists "+remote_url);texlive404_cache[cacheKey]=1;return 0}',
	"else{texlive404_cache[cacheKey]=1;return 0}",
);
patch(
	'else if(xhr.status===301){console.log("TexLive File not exists "+remote_url);pk404_cache[cacheKey]=1;return 0}',
	"else{pk404_cache[cacheKey]=1;return 0}",
);
patch(
	'else if(cmd==="flushcache"){cleanDir(WORKROOT)}',
	'else if(cmd==="flushcache"){cleanDir(WORKROOT);self.postMessage({"result":"ok","cmd":"flushcache"})}' +
		'else if(cmd==="preload"){for(const [key,bytes] of data["files"]){const savepath=TEXCACHEROOT+"/"+key.replace("/","-");' +
		'FS.writeFile(savepath,bytes);texlive200_cache[key]=savepath}self.postMessage({"result":"ok","cmd":"preload"})}',
);

patch(
	'Module["print"]=function(a){self.memlog+=a+"\\n"};',
	'Module["print"]=function(a){self.memlog+=a+"\\n";const pages=a.match(/\\[\\d+/g);' +
		'if(pages)self.postMessage({"cmd":"progress","page":+pages[pages.length-1].slice(1)})};',
);

writeFileSync(new URL("../public/engine/swiftlatexpdftex.js", import.meta.url), source);
