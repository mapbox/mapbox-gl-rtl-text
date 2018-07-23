(function(){
var Module = {
  TOTAL_MEMORY: 8*1024*1024,
  TOTAL_STACK: 2*1024*1024 ,
  preRun: [],
  postRun: [],
  print: function( text ) {
    console.log(text);
  },
  printErr: function(text) {
    text = Array.prototype.slice.call(arguments).join(' ');
    if ( text.indexOf( 'pre-main prep time' ) >= 0 ) {
      return;
    }
    console.error(text);
  }
};
var Module = typeof Module !== 'undefined' ? Module : {};
var moduleOverrides = {};
var key;
for (key in Module) {
    if (Module.hasOwnProperty(key)) {
        moduleOverrides[key] = Module[key];
    }
}
Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function (status, toThrow) {
    throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
ENVIRONMENT_IS_WEB = typeof window === 'object';
ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
if (ENVIRONMENT_IS_NODE) {
    var nodeFS;
    var nodePath;
    Module['read'] = function shell_read(filename, binary) {
        var ret;
        if (!nodeFS)
            nodeFS = require('fs');
        if (!nodePath)
            nodePath = require('path');
        filename = nodePath['normalize'](filename);
        ret = nodeFS['readFileSync'](filename);
        return binary ? ret : ret.toString();
    };
    Module['readBinary'] = function readBinary(filename) {
        var ret = Module['read'](filename, true);
        if (!ret.buffer) {
            ret = new Uint8Array(ret);
        }
        return ret;
    };
    if (process['argv'].length > 1) {
        Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    }
    Module['arguments'] = process['argv'].slice(2);
    if (typeof module !== 'undefined') {
        module['exports'] = Module;
    }
    process['on']('uncaughtException', function (ex) {
        if (!(ex instanceof ExitStatus)) {
            throw ex;
        }
    });
    process['on']('unhandledRejection', function (reason, p) {
        process['exit'](1);
    });
    Module['quit'] = function (status) {
        process['exit'](status);
    };
    Module['inspect'] = function () {
        return '[Emscripten Module object]';
    };
} else if (ENVIRONMENT_IS_SHELL) {
    if (typeof read != 'undefined') {
        Module['read'] = function shell_read(f) {
            return read(f);
        };
    }
    Module['readBinary'] = function readBinary(f) {
        var data;
        if (typeof readbuffer === 'function') {
            return new Uint8Array(readbuffer(f));
        }
        data = read(f, 'binary');
        return data;
    };
    if (typeof scriptArgs != 'undefined') {
        Module['arguments'] = scriptArgs;
    } else if (typeof arguments != 'undefined') {
        Module['arguments'] = arguments;
    }
    if (typeof quit === 'function') {
        Module['quit'] = function (status) {
            quit(status);
        };
    }
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    Module['read'] = function shell_read(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send(null);
        return xhr.responseText;
    };
    if (ENVIRONMENT_IS_WORKER) {
        Module['readBinary'] = function readBinary(url) {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.responseType = 'arraybuffer';
            xhr.send(null);
            return new Uint8Array(xhr.response);
        };
    }
    Module['readAsync'] = function readAsync(url, onload, onerror) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';
        xhr.onload = function xhr_onload() {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                onload(xhr.response);
                return;
            }
            onerror();
        };
        xhr.onerror = onerror;
        xhr.send(null);
    };
    Module['setWindowTitle'] = function (title) {
        document.title = title;
    };
} else {
}
var out = Module['print'] || (typeof console !== 'undefined' ? console.log.bind(console) : typeof print !== 'undefined' ? print : null);
var err = Module['printErr'] || (typeof printErr !== 'undefined' ? printErr : typeof console !== 'undefined' && console.warn.bind(console) || out);
for (key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
        Module[key] = moduleOverrides[key];
    }
}
moduleOverrides = undefined;
var STACK_ALIGN = 16;
function staticAlloc(size) {
    var ret = STATICTOP;
    STATICTOP = STATICTOP + size + 15 & -16;
    return ret;
}
function dynamicAlloc(size) {
    var ret = HEAP32[DYNAMICTOP_PTR >> 2];
    var end = ret + size + 15 & -16;
    HEAP32[DYNAMICTOP_PTR >> 2] = end;
    if (end >= TOTAL_MEMORY) {
        var success = enlargeMemory();
        if (!success) {
            HEAP32[DYNAMICTOP_PTR >> 2] = ret;
            return 0;
        }
    }
    return ret;
}
function alignMemory(size, factor) {
    if (!factor)
        factor = STACK_ALIGN;
    var ret = size = Math.ceil(size / factor) * factor;
    return ret;
}
var asm2wasmImports = {
    'f64-rem': function (x, y) {
        return x % y;
    },
    'debugger': function () {
        debugger;
    }
};
var functionPointers = new Array(0);
var GLOBAL_BASE = 1024;
var ABORT = 0;
var EXITSTATUS = 0;
function assert_em(condition, text) {
    if (!condition) {
        abort('Assertion failed: ' + text);
    }
}
function getCFunc(ident) {
    var func = Module['_' + ident];
    return func;
}
var JSfuncs = {
    'stackSave': function () {
        stackSave();
    },
    'stackRestore': function () {
        stackRestore();
    },
    'arrayToC': function (arr) {
        var ret = stackAlloc(arr.length);
        writeArrayToMemory(arr, ret);
        return ret;
    },
    'stringToC': function (str) {
        var ret = 0;
        if (str !== null && str !== undefined && str !== 0) {
            var len = (str.length << 2) + 1;
            ret = stackAlloc(len);
            stringToUTF8(str, ret, len);
        }
        return ret;
    }
};
var toC = {
    'string': JSfuncs['stringToC'],
    'array': JSfuncs['arrayToC']
};
function ccall(ident, returnType, argTypes, args, opts) {
    function convertReturnValue(ret) {
        if (returnType === 'string')
            return Pointer_stringify(ret);
        if (returnType === 'boolean')
            return Boolean(ret);
        return ret;
    }
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
        for (var i = 0; i < args.length; i++) {
            var converter = toC[argTypes[i]];
            if (converter) {
                if (stack === 0)
                    stack = stackSave();
                cArgs[i] = converter(args[i]);
            } else {
                cArgs[i] = args[i];
            }
        }
    }
    var ret = func.apply(null, cArgs);
    ret = convertReturnValue(ret);
    if (stack !== 0)
        stackRestore(stack);
    return ret;
}
function getMemory(size) {
    if (!staticSealed)
        return staticAlloc(size);
    if (!runtimeInitialized)
        return dynamicAlloc(size);
    return _malloc(size);
}
function Pointer_stringify(ptr, length) {
    if (length === 0 || !ptr)
        return '';
    var hasUtf = 0;
    var t;
    var i = 0;
    while (1) {
        t = HEAPU8[ptr + i >> 0];
        hasUtf |= t;
        if (t == 0 && !length)
            break;
        i++;
        if (length && i == length)
            break;
    }
    if (!length)
        length = i;
    var ret = '';
    if (hasUtf < 128) {
        var MAX_CHUNK = 1024;
        var curr;
        while (length > 0) {
            curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
            ret = ret ? ret + curr : curr;
            ptr += MAX_CHUNK;
            length -= MAX_CHUNK;
        }
        return ret;
    }
    return UTF8ToString(ptr);
}
var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
    var endPtr = idx;
    while (u8Array[endPtr])
        ++endPtr;
    if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
    } else {
        var u0, u1, u2, u3, u4, u5;
        var str = '';
        while (1) {
            u0 = u8Array[idx++];
            if (!u0)
                return str;
            if (!(u0 & 128)) {
                str += String.fromCharCode(u0);
                continue;
            }
            u1 = u8Array[idx++] & 63;
            if ((u0 & 224) == 192) {
                str += String.fromCharCode((u0 & 31) << 6 | u1);
                continue;
            }
            u2 = u8Array[idx++] & 63;
            if ((u0 & 240) == 224) {
                u0 = (u0 & 15) << 12 | u1 << 6 | u2;
            } else {
                u3 = u8Array[idx++] & 63;
                if ((u0 & 248) == 240) {
                    u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | u3;
                } else {
                    u4 = u8Array[idx++] & 63;
                    if ((u0 & 252) == 248) {
                        u0 = (u0 & 3) << 24 | u1 << 18 | u2 << 12 | u3 << 6 | u4;
                    } else {
                        u5 = u8Array[idx++] & 63;
                        u0 = (u0 & 1) << 30 | u1 << 24 | u2 << 18 | u3 << 12 | u4 << 6 | u5;
                    }
                }
            }
            if (u0 < 65536) {
                str += String.fromCharCode(u0);
            } else {
                var ch = u0 - 65536;
                str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
            }
        }
    }
}
function UTF8ToString(ptr) {
    return UTF8ArrayToString(HEAPU8, ptr);
}
function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0))
        return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343)
            u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127) {
            if (outIdx >= endIdx)
                break;
            outU8Array[outIdx++] = u;
        } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx)
                break;
            outU8Array[outIdx++] = 192 | u >> 6;
            outU8Array[outIdx++] = 128 | u & 63;
        } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx)
                break;
            outU8Array[outIdx++] = 224 | u >> 12;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63;
        } else if (u <= 2097151) {
            if (outIdx + 3 >= endIdx)
                break;
            outU8Array[outIdx++] = 240 | u >> 18;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63;
        } else if (u <= 67108863) {
            if (outIdx + 4 >= endIdx)
                break;
            outU8Array[outIdx++] = 248 | u >> 24;
            outU8Array[outIdx++] = 128 | u >> 18 & 63;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63;
        } else {
            if (outIdx + 5 >= endIdx)
                break;
            outU8Array[outIdx++] = 252 | u >> 30;
            outU8Array[outIdx++] = 128 | u >> 24 & 63;
            outU8Array[outIdx++] = 128 | u >> 18 & 63;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63;
        }
    }
    outU8Array[outIdx] = 0;
    return outIdx - startIdx;
}
function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite);
}
var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
    var endPtr = ptr;
    var idx = endPtr >> 1;
    while (HEAP16[idx])
        ++idx;
    endPtr = idx << 1;
    if (endPtr - ptr > 32 && UTF16Decoder) {
        return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
    } else {
        var i = 0;
        var str = '';
        while (1) {
            var codeUnit = HEAP16[ptr + i * 2 >> 1];
            if (codeUnit == 0)
                return str;
            ++i;
            str += String.fromCharCode(codeUnit);
        }
    }
}
function stringToUTF16(str, outPtr, maxBytesToWrite) {
    if (maxBytesToWrite === undefined) {
        maxBytesToWrite = 2147483647;
    }
    if (maxBytesToWrite < 2)
        return 0;
    maxBytesToWrite -= 2;
    var startPtr = outPtr;
    var numCharsToWrite = maxBytesToWrite < str.length * 2 ? maxBytesToWrite / 2 : str.length;
    for (var i = 0; i < numCharsToWrite; ++i) {
        var codeUnit = str.charCodeAt(i);
        HEAP16[outPtr >> 1] = codeUnit;
        outPtr += 2;
    }
    HEAP16[outPtr >> 1] = 0;
    return outPtr - startPtr;
}
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;
function alignUp(x, multiple) {
    if (x % multiple > 0) {
        x += multiple - x % multiple;
    }
    return x;
}
var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;
function updateGlobalBuffer(buf) {
    Module['buffer'] = buffer = buf;
}
function updateGlobalBufferViews() {
    Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
    Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
    Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
    Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
    Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
    Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
    Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
    Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}
var STATIC_BASE, STATICTOP, staticSealed;
var STACK_BASE, STACKTOP, STACK_MAX;
var DYNAMIC_BASE, DYNAMICTOP_PTR;
STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
staticSealed = false;
function abortOnCannotGrowMemory() {
    abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}
if (!Module['reallocBuffer'])
    Module['reallocBuffer'] = function (size) {
        var ret;
        try {
            if (ArrayBuffer.transfer) {
                ret = ArrayBuffer.transfer(buffer, size);
            } else {
                var oldHEAP8 = HEAP8;
                ret = new ArrayBuffer(size);
                var temp = new Int8Array(ret);
                temp.set(oldHEAP8);
            }
        } catch (e) {
            return false;
        }
        var success = _emscripten_replace_memory(ret);
        if (!success)
            return false;
        return ret;
    };
function enlargeMemory() {
    var PAGE_MULTIPLE = Module['usingWasm'] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE;
    var LIMIT = 2147483648 - PAGE_MULTIPLE;
    if (HEAP32[DYNAMICTOP_PTR >> 2] > LIMIT) {
        return false;
    }
    var OLD_TOTAL_MEMORY = TOTAL_MEMORY;
    TOTAL_MEMORY = Math.max(TOTAL_MEMORY, MIN_TOTAL_MEMORY);
    while (TOTAL_MEMORY < HEAP32[DYNAMICTOP_PTR >> 2]) {
        if (TOTAL_MEMORY <= 536870912) {
            TOTAL_MEMORY = alignUp(2 * TOTAL_MEMORY, PAGE_MULTIPLE);
        } else {
            TOTAL_MEMORY = Math.min(alignUp((3 * TOTAL_MEMORY + 2147483648) / 4, PAGE_MULTIPLE), LIMIT);
        }
    }
    var replacement = Module['reallocBuffer'](TOTAL_MEMORY);
    if (!replacement || replacement.byteLength != TOTAL_MEMORY) {
        TOTAL_MEMORY = OLD_TOTAL_MEMORY;
        return false;
    }
    updateGlobalBuffer(replacement);
    updateGlobalBufferViews();
    return true;
}
var byteLength;
try {
    byteLength = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get);
    byteLength(new ArrayBuffer(4));
} catch (e) {
    byteLength = function (buffer) {
        return buffer.byteLength;
    };
}
var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK)
    err('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');
if (Module['buffer']) {
    buffer = Module['buffer'];
} else {
    if (typeof WebAssembly === 'object' && typeof WebAssembly.Memory === 'function') {
        Module['wasmMemory'] = new WebAssembly.Memory({ 'initial': TOTAL_MEMORY / WASM_PAGE_SIZE });
        buffer = Module['wasmMemory'].buffer;
    } else {
        buffer = new ArrayBuffer(TOTAL_MEMORY);
    }
    Module['buffer'] = buffer;
}
updateGlobalBufferViews();
function getTotalMemory() {
    return TOTAL_MEMORY;
}
function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == 'function') {
            callback();
            continue;
        }
        var func = callback.func;
        if (typeof func === 'number') {
            if (callback.arg === undefined) {
                Module['dynCall_v'](func);
            } else {
                Module['dynCall_vi'](func, callback.arg);
            }
        } else {
            func(callback.arg === undefined ? null : callback.arg);
        }
    }
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
function preRun() {
    if (Module['preRun']) {
        if (typeof Module['preRun'] == 'function')
            Module['preRun'] = [Module['preRun']];
        while (Module['preRun'].length) {
            addOnPreRun(Module['preRun'].shift());
        }
    }
    callRuntimeCallbacks(__ATPRERUN__);
}
function ensureInitRuntime() {
    if (runtimeInitialized)
        return;
    runtimeInitialized = true;
    callRuntimeCallbacks(__ATINIT__);
}
function preMain() {
    callRuntimeCallbacks(__ATMAIN__);
}
function postRun() {
    if (Module['postRun']) {
        if (typeof Module['postRun'] == 'function')
            Module['postRun'] = [Module['postRun']];
        while (Module['postRun'].length) {
            addOnPostRun(Module['postRun'].shift());
        }
    }
    callRuntimeCallbacks(__ATPOSTRUN__);
}
function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb);
}
function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb);
}
function writeArrayToMemory(array, buffer) {
    HEAP8.set(array, buffer);
}
function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer++ >> 0] = str.charCodeAt(i);
    }
    if (!dontAddNull)
        HEAP8[buffer >> 0] = 0;
}
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;
function addRunDependency(id) {
    runDependencies++;
    if (Module['monitorRunDependencies']) {
        Module['monitorRunDependencies'](runDependencies);
    }
}
function removeRunDependency(id) {
    runDependencies--;
    if (Module['monitorRunDependencies']) {
        Module['monitorRunDependencies'](runDependencies);
    }
    if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null;
        }
        if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback();
        }
    }
}
Module['preloadedImages'] = {};
Module['preloadedAudios'] = {};
var dataURIPrefix = 'data:application/octet-stream;base64,';
function isDataURI(filename) {
    return String.prototype.startsWith ? filename.startsWith(dataURIPrefix) : filename.indexOf(dataURIPrefix) === 0;
}
function integrateWasmJS() {
    var wasmTextFile = 'wrapper.wasm.wast';
    var wasmBinaryFile = 'wrapper.wasm.wasm';
    var asmjsCodeFile = 'wrapper.wasm.temp.asm.js';
    if (typeof Module['locateFile'] === 'function') {
        if (!isDataURI(wasmTextFile)) {
            wasmTextFile = Module['locateFile'](wasmTextFile);
        }
        if (!isDataURI(wasmBinaryFile)) {
            wasmBinaryFile = Module['locateFile'](wasmBinaryFile);
        }
        if (!isDataURI(asmjsCodeFile)) {
            asmjsCodeFile = Module['locateFile'](asmjsCodeFile);
        }
    }
    var wasmPageSize = 64 * 1024;
    var info = {
        'global': null,
        'env': null,
        'asm2wasm': asm2wasmImports,
        'parent': Module
    };
    var exports = null;
    function mergeMemory(newBuffer) {
        var oldBuffer = Module['buffer'];
        if (newBuffer.byteLength < oldBuffer.byteLength) {
            err('the new buffer in mergeMemory is smaller than the previous one. in native wasm, we should grow memory here');
        }
        var oldView = new Int8Array(oldBuffer);
        var newView = new Int8Array(newBuffer);
        newView.set(oldView);
        updateGlobalBuffer(newBuffer);
        updateGlobalBufferViews();
    }
    function fixImports(imports) {
        return imports;
    }
    function getBinary() {
        try {
            if (Module['wasmBinary']) {
                return new Uint8Array(Module['wasmBinary']);
            }
            if (Module['readBinary']) {
                return Module['readBinary'](wasmBinaryFile);
            } else {
                throw 'on the web, we need the wasm binary to be preloaded and set on Module[\'wasmBinary\']. emcc.py will do that for you when generating HTML (but not JS)';
            }
        } catch (err) {
            abort(err);
        }
    }
    function getBinaryPromise() {
        if (!Module['wasmBinary'] && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === 'function') {
            return fetch(wasmBinaryFile, { credentials: 'same-origin' }).then(function (response) {
                if (!response['ok']) {
                    throw 'failed to load wasm binary file at \'' + wasmBinaryFile + '\'';
                }
                return response['arrayBuffer']();
            }).catch(function () {
                return getBinary();
            });
        }
        return new Promise(function (resolve, reject) {
            resolve(getBinary());
        });
    }
    function doNativeWasm(global, env, providedBuffer) {
        if (typeof WebAssembly !== 'object') {
            err('no native wasm support detected');
            return false;
        }
        if (!(Module['wasmMemory'] instanceof WebAssembly.Memory)) {
            err('no native wasm Memory in use');
            return false;
        }
        env['memory'] = Module['wasmMemory'];
        info['global'] = {
            'NaN': NaN,
            'Infinity': Infinity
        };
        info['global.Math'] = Math;
        info['env'] = env;
        function receiveInstance(instance, module) {
            exports = instance.exports;
            if (exports.memory)
                mergeMemory(exports.memory);
            Module['asm'] = exports;
            Module['usingWasm'] = true;
            removeRunDependency('wasm-instantiate');
        }
        addRunDependency('wasm-instantiate');
        if (Module['instantiateWasm']) {
            try {
                return Module['instantiateWasm'](info, receiveInstance);
            } catch (e) {
                err('Module.instantiateWasm callback failed with error: ' + e);
                return false;
            }
        }
        function receiveInstantiatedSource(output) {
            receiveInstance(output['instance'], output['module']);
        }
        function instantiateArrayBuffer(receiver) {
            getBinaryPromise().then(function (binary) {
                return WebAssembly.instantiate(binary, info);
            }).then(receiver).catch(function (reason) {
                err('failed to asynchronously prepare wasm: ' + reason);
                abort(reason);
            });
        }
        if (!Module['wasmBinary'] && typeof WebAssembly.instantiateStreaming === 'function' && !isDataURI(wasmBinaryFile) && typeof fetch === 'function') {
            WebAssembly.instantiateStreaming(fetch(wasmBinaryFile, { credentials: 'same-origin' }), info).then(receiveInstantiatedSource).catch(function (reason) {
                err('wasm streaming compile failed: ' + reason);
                err('falling back to ArrayBuffer instantiation');
                instantiateArrayBuffer(receiveInstantiatedSource);
            });
        } else {
            instantiateArrayBuffer(receiveInstantiatedSource);
        }
        return {};
    }
    Module['asmPreload'] = Module['asm'];
    var asmjsReallocBuffer = Module['reallocBuffer'];
    var wasmReallocBuffer = function (size) {
        var PAGE_MULTIPLE = Module['usingWasm'] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE;
        size = alignUp(size, PAGE_MULTIPLE);
        var old = Module['buffer'];
        var oldSize = old.byteLength;
        if (Module['usingWasm']) {
            try {
                var result = Module['wasmMemory'].grow((size - oldSize) / wasmPageSize);
                if (result !== (-1 | 0)) {
                    return Module['buffer'] = Module['wasmMemory'].buffer;
                } else {
                    return null;
                }
            } catch (e) {
                return null;
            }
        }
    };
    Module['reallocBuffer'] = function (size) {
        if (finalMethod === 'asmjs') {
            return asmjsReallocBuffer(size);
        } else {
            return wasmReallocBuffer(size);
        }
    };
    var finalMethod = '';
    Module['asm'] = function (global, env, providedBuffer) {
        env = fixImports(env);
        if (!env['table']) {
            var TABLE_SIZE = Module['wasmTableSize'];
            if (TABLE_SIZE === undefined)
                TABLE_SIZE = 1024;
            var MAX_TABLE_SIZE = Module['wasmMaxTableSize'];
            if (typeof WebAssembly === 'object' && typeof WebAssembly.Table === 'function') {
                if (MAX_TABLE_SIZE !== undefined) {
                    env['table'] = new WebAssembly.Table({
                        'initial': TABLE_SIZE,
                        'maximum': MAX_TABLE_SIZE,
                        'element': 'anyfunc'
                    });
                } else {
                    env['table'] = new WebAssembly.Table({
                        'initial': TABLE_SIZE,
                        element: 'anyfunc'
                    });
                }
            } else {
                env['table'] = new Array(TABLE_SIZE);
            }
            Module['wasmTable'] = env['table'];
        }
        if (!env['memoryBase']) {
            env['memoryBase'] = Module['STATIC_BASE'];
        }
        if (!env['tableBase']) {
            env['tableBase'] = 0;
        }
        var exports;
        exports = doNativeWasm(global, env, providedBuffer);
        return exports;
    };
}
integrateWasmJS();
STATIC_BASE = GLOBAL_BASE;
STATICTOP = STATIC_BASE + 71792;
__ATINIT__.push({
    func: function () {
        ___emscripten_environ_constructor();
    }
});
var STATIC_BUMP = 71792;
Module['STATIC_BASE'] = STATIC_BASE;
Module['STATIC_BUMP'] = STATIC_BUMP;
STATICTOP += 16;
var ENV = {};
function ___buildEnvironment(environ) {
    var MAX_ENV_VALUES = 64;
    var TOTAL_ENV_SIZE = 1024;
    var poolPtr;
    var envPtr;
    if (!___buildEnvironment.called) {
        ___buildEnvironment.called = true;
        ENV['USER'] = ENV['LOGNAME'] = 'web_user';
        ENV['PATH'] = '/';
        ENV['PWD'] = '/';
        ENV['HOME'] = '/home/web_user';
        ENV['LANG'] = 'C.UTF-8';
        ENV['_'] = Module['thisProgram'];
        poolPtr = getMemory(TOTAL_ENV_SIZE);
        envPtr = getMemory(MAX_ENV_VALUES * 4);
        HEAP32[envPtr >> 2] = poolPtr;
        HEAP32[environ >> 2] = envPtr;
    } else {
        envPtr = HEAP32[environ >> 2];
        poolPtr = HEAP32[envPtr >> 2];
    }
    var strings = [];
    var totalSize = 0;
    for (var key in ENV) {
        if (typeof ENV[key] === 'string') {
            var line = key + '=' + ENV[key];
            strings.push(line);
            totalSize += line.length;
        }
    }
    if (totalSize > TOTAL_ENV_SIZE) {
        throw new Error('Environment size exceeded TOTAL_ENV_SIZE!');
    }
    var ptrSize = 4;
    for (var i = 0; i < strings.length; i++) {
        var line = strings[i];
        writeAsciiToMemory(line, poolPtr);
        HEAP32[envPtr + i * ptrSize >> 2] = poolPtr;
        poolPtr += line.length + 1;
    }
    HEAP32[envPtr + strings.length * ptrSize >> 2] = 0;
}
var EXCEPTIONS = {
    last: 0,
    caught: [],
    infos: {},
    deAdjust: function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted])
            return adjusted;
        for (var key in EXCEPTIONS.infos) {
            var ptr = +key;
            var info = EXCEPTIONS.infos[ptr];
            if (info.adjusted === adjusted) {
                return ptr;
            }
        }
        return adjusted;
    },
    addRef: function (ptr) {
        if (!ptr)
            return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
    },
    decRef: function (ptr) {
        if (!ptr)
            return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount--;
        if (info.refcount === 0 && !info.rethrown) {
            if (info.destructor) {
                Module['dynCall_vi'](info.destructor, ptr);
            }
            delete EXCEPTIONS.infos[ptr];
            ___cxa_free_exception(ptr);
        }
    },
    clearRef: function (ptr) {
        if (!ptr)
            return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
    }
};
function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
    return dest;
}
function ___setErrNo(value) {
    if (Module['___errno_location'])
        HEAP32[Module['___errno_location']() >> 2] = value;
    return value;
}
DYNAMICTOP_PTR = staticAlloc(4);
STACK_BASE = STACKTOP = alignMemory(STATICTOP);
STACK_MAX = STACK_BASE + TOTAL_STACK;
DYNAMIC_BASE = alignMemory(STACK_MAX);
HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
staticSealed = true;
Module['wasmTableSize'] = 23;
Module['wasmMaxTableSize'] = 23;
Module.asmGlobalArg = {};
Module.asmLibraryArg = {
    'abort': abort,
    'enlargeMemory': enlargeMemory,
    'getTotalMemory': getTotalMemory,
    'abortOnCannotGrowMemory': abortOnCannotGrowMemory,
    '___buildEnvironment': ___buildEnvironment,
    '___setErrNo': ___setErrNo,
    '_emscripten_memcpy_big': _emscripten_memcpy_big,
    'DYNAMICTOP_PTR': DYNAMICTOP_PTR,
    'STACKTOP': STACKTOP
};
var asm = Module['asm'](Module.asmGlobalArg, Module.asmLibraryArg, buffer);
Module['asm'] = asm;
var ___emscripten_environ_constructor = Module['___emscripten_environ_constructor'] = function () {
    return Module['asm']['___emscripten_environ_constructor'].apply(null, arguments);
};
var _bidi_getLine = Module['_bidi_getLine'] = function () {
    return Module['asm']['_bidi_getLine'].apply(null, arguments);
};
var _bidi_getParagraphEndIndex = Module['_bidi_getParagraphEndIndex'] = function () {
    return Module['asm']['_bidi_getParagraphEndIndex'].apply(null, arguments);
};
var _bidi_getVisualRun = Module['_bidi_getVisualRun'] = function () {
    return Module['asm']['_bidi_getVisualRun'].apply(null, arguments);
};
var _bidi_processText = Module['_bidi_processText'] = function () {
    return Module['asm']['_bidi_processText'].apply(null, arguments);
};
var _bidi_setLine = Module['_bidi_setLine'] = function () {
    return Module['asm']['_bidi_setLine'].apply(null, arguments);
};
var _bidi_writeReverse = Module['_bidi_writeReverse'] = function () {
    return Module['asm']['_bidi_writeReverse'].apply(null, arguments);
};
var _emscripten_replace_memory = Module['_emscripten_replace_memory'] = function () {
    return Module['asm']['_emscripten_replace_memory'].apply(null, arguments);
};
var _malloc = Module['_malloc'] = function () {
    return Module['asm']['_malloc'].apply(null, arguments);
};
var _ushape_arabic = Module['_ushape_arabic'] = function () {
    return Module['asm']['_ushape_arabic'].apply(null, arguments);
};
var stackAlloc = Module['stackAlloc'] = function () {
    return Module['asm']['stackAlloc'].apply(null, arguments);
};
var stackRestore = Module['stackRestore'] = function () {
    return Module['asm']['stackRestore'].apply(null, arguments);
};
var stackSave = Module['stackSave'] = function () {
    return Module['asm']['stackSave'].apply(null, arguments);
};
var dynCall_vi = Module['dynCall_vi'] = function () {
    return Module['asm']['dynCall_vi'].apply(null, arguments);
};
Module['asm'] = asm;
Module['ccall'] = ccall;
Module['UTF16ToString'] = UTF16ToString;
Module['stringToUTF16'] = stringToUTF16;
function ExitStatus(status) {
    this.name = 'ExitStatus';
    this.message = 'Program terminated with exit(' + status + ')';
    this.status = status;
}
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;
dependenciesFulfilled = function runCaller() {
    if (!Module['calledRun'])
        run();
    if (!Module['calledRun'])
        dependenciesFulfilled = runCaller;
};
function run(args) {
    args = args || Module['arguments'];
    if (runDependencies > 0) {
        return;
    }
    preRun();
    if (runDependencies > 0)
        return;
    if (Module['calledRun'])
        return;
    function doRun() {
        if (Module['calledRun'])
            return;
        Module['calledRun'] = true;
        if (ABORT)
            return;
        ensureInitRuntime();
        preMain();
        if (Module['onRuntimeInitialized'])
            Module['onRuntimeInitialized']();
        postRun();
    }
    if (Module['setStatus']) {
        Module['setStatus']('Running...');
        setTimeout(function () {
            setTimeout(function () {
                Module['setStatus']('');
            }, 1);
            doRun();
        }, 1);
    } else {
        doRun();
    }
}
Module['run'] = run;
function abort(what) {
    if (Module['onAbort']) {
        Module['onAbort'](what);
    }
    if (what !== undefined) {
        out(what);
        err(what);
        what = JSON.stringify(what);
    } else {
        what = '';
    }
    ABORT = true;
    EXITSTATUS = 1;
    throw 'abort(' + what + '). Build with -s ASSERTIONS=1 for more info.';
}
Module['abort'] = abort;
if (Module['preInit']) {
    if (typeof Module['preInit'] == 'function')
        Module['preInit'] = [Module['preInit']];
    while (Module['preInit'].length > 0) {
        Module['preInit'].pop()();
    }
}
Module['noExitRuntime'] = true;
run();
'use strict';


/**
 * Takes logical input and replaces Arabic characters with the "presentation form"
 * of their initial/medial/final forms, based on their order in the input.
 *
 * The results are still in logical order.
 *
 * @param {string} [input] Input text in logical order
 * @returns {string} Transformed text using Arabic presentation forms
 */
function applyArabicShaping(input) {
    if (!input)
        { return input; }

    var nDataBytes = (input.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    Module.stringToUTF16(input, stringInputPtr, nDataBytes);
    var returnStringPtr = Module.ccall('ushape_arabic', 'number', ['number', 'number'], [stringInputPtr, input.length]);
    Module._free(stringInputPtr);

    if (returnStringPtr === 0)
        { return input; }

    var result = Module.UTF16ToString(returnStringPtr);
    Module._free(returnStringPtr);

    return result;
}

function mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount) {
    var mergedParagraphLineBreakPoints = [];

    for (var i = 0; i < paragraphCount; i++) {
        var paragraphEndIndex = Module.ccall('bidi_getParagraphEndIndex', 'number', ['number'], [i]);
        // TODO: Handle error?

        for (var i$1 = 0, list = lineBreakPoints; i$1 < list.length; i$1 += 1) {
            var lineBreakPoint = list[i$1];

            if (lineBreakPoint < paragraphEndIndex &&
                (!mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1] || lineBreakPoint > mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1]))
                { mergedParagraphLineBreakPoints.push(lineBreakPoint); }
        }
        mergedParagraphLineBreakPoints.push(paragraphEndIndex);
    }

    for (var i$2 = 0, list$1 = lineBreakPoints; i$2 < list$1.length; i$2 += 1) {
        var lineBreakPoint$1 = list$1[i$2];

        if (lineBreakPoint$1 > mergedParagraphLineBreakPoints[mergedParagraphLineBreakPoints.length - 1])
            { mergedParagraphLineBreakPoints.push(lineBreakPoint$1); }
    }

    return mergedParagraphLineBreakPoints;
}

// This function is stateful: it sets a static BiDi paragaph object
// on the "native" side
function setParagraph(input, stringInputPtr, nDataBytes) {
    if (!input) {
        return null;
    }

    Module.stringToUTF16(input, stringInputPtr, nDataBytes);
    var paragraphCount = Module.ccall('bidi_processText', 'number', ['number', 'number'], [stringInputPtr, input.length]);

    if (paragraphCount === 0) {
        Module._free(stringInputPtr);
        return null;
    }
    return paragraphCount;
}

/**
 * Takes input text in logical order and applies the BiDi algorithm using the chosen
 * line break point to generate a set of lines with the characters re-arranged into
 * visual order.
 *
 * @param {string} [input] Input text in logical order
 * @param {Array<number>} [lineBreakPoints] Each line break is an index into the input string
 *
 * @returns {Array<string>} One string per line, with each string in visual order
 */
function processBidirectionalText(input, lineBreakPoints) {
    var nDataBytes = (input.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    var paragraphCount = setParagraph(input, stringInputPtr, nDataBytes);
    if (!paragraphCount) {
        return [input];
    }

    var mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    var lineStartIndex = 0;
    var lines = [];

    for (var i = 0, list = mergedParagraphLineBreakPoints; i < list.length; i += 1) {
        var lineBreakPoint = list[i];

        var returnStringPtr = Module.ccall('bidi_getLine', 'number', ['number', 'number'], [lineStartIndex, lineBreakPoint]);

        if (returnStringPtr === 0) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        lines.push(Module.UTF16ToString(returnStringPtr));
        Module._free(returnStringPtr);

        lineStartIndex = lineBreakPoint;
    }

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}

function createInt32Ptr() {
    return Module._malloc(4);
}

function consumeInt32Ptr(ptr) {
    var heapView = new Int32Array(Module.HEAPU8.buffer, ptr, 1);
    var result = heapView[0];
    Module._free(ptr);
    return result;
}

function writeReverse(stringInputPtr, logicalStart, logicalEnd) {
    var returnStringPtr = Module.ccall('bidi_writeReverse', 'number', ['number', 'number', 'number'], [stringInputPtr, logicalStart, logicalEnd - logicalStart]);

    if (returnStringPtr === 0) {
        return null;
    }
    var reversed = Module.UTF16ToString(returnStringPtr);
    Module._free(returnStringPtr);
    return reversed;
}

/**
 * Takes input text in logical order and applies the BiDi algorithm using the chosen
 * line break point to generate a set of lines with the characters re-arranged into
 * visual order.
 *
 * Also takes an array of "style indices" that specify different styling on the input
 * characters (the styles are represented as integers here, the caller is responsible
 * for the actual implementation of styling). BiDi can both reorder and add/remove
 * characters from the input string, but this function copies style information from
 * the "source" logical characters to their corresponding visual characters in the output.
 *
 * @param {string} [input] Input text in logical order
 * @param {Array<number>} [styleIndices] Same length as input text, each entry represents the style
 *                                       of the corresponding input character.
 * @param {Array<number>} [lineBreakPoints] Each line break is an index into the input string
 * @returns {Array<[string,Array<number>>]} One string per line, with each string in visual order.
 *                               Each string has a matching array of style indices in the same order.
 */
function processStyledBidirectionalText(text, styleIndices, lineBreakPoints) {
    var nDataBytes = (text.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    var paragraphCount = setParagraph(text, stringInputPtr, nDataBytes);
    if (!paragraphCount) {
        return [{text: text, styleIndices: styleIndices}];
    }

    var mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    var lineStartIndex = 0;
    var lines = [];

    for (var i$1 = 0, list = mergedParagraphLineBreakPoints; i$1 < list.length; i$1 += 1) {
        var lineBreakPoint = list[i$1];

        var lineText = "";
        var lineStyleIndices = [];
        var runCount = Module.ccall('bidi_setLine', 'number', ['number', 'number'], [lineStartIndex, lineBreakPoint]);

        if (!runCount) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        for (var i = 0; i < runCount; i++) {
            var logicalStartPtr = createInt32Ptr();
            var logicalLengthPtr = createInt32Ptr();
            var isReversed = Module.ccall('bidi_getVisualRun', 'number', ['number', 'number', 'number'], [i, logicalStartPtr, logicalLengthPtr]);

            var logicalStart = lineStartIndex + consumeInt32Ptr(logicalStartPtr);
            var logicalLength = consumeInt32Ptr(logicalLengthPtr);
            var logicalEnd = logicalStart + logicalLength;
            if (isReversed) {
                // Within this reversed section, iterate logically backwards
                // Each time we see a change in style, render a reversed chunk
                // of everything since the last change
                var styleRunStart = logicalEnd;
                var currentStyleIndex = styleIndices[styleRunStart - 1];
                for (var j = logicalEnd - 1; j >= logicalStart; j--) {
                    if (currentStyleIndex !== styleIndices[j] || j === logicalStart) {
                        var styleRunEnd = j === logicalStart ? j : j + 1;
                        var reversed = writeReverse(stringInputPtr, styleRunEnd, styleRunStart);
                        if (!reversed) {
                            Module._free(stringInputPtr);
                            return [];
                        }
                        lineText += reversed;
                        for (var k = 0; k < reversed.length; k++) {
                            lineStyleIndices.push(currentStyleIndex);
                        }
                        currentStyleIndex = styleIndices[j];
                        styleRunStart = styleRunEnd;
                    }
                }

            } else {
                lineText += text.substring(logicalStart, logicalEnd);
                lineStyleIndices = lineStyleIndices.concat(styleIndices.slice(logicalStart, logicalEnd));
            }
        }

        lines.push([lineText, lineStyleIndices]);
        lineStartIndex = lineBreakPoint;
    }

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}

self.registerRTLTextPlugin({'applyArabicShaping': applyArabicShaping, 'processBidirectionalText': processBidirectionalText, 'processStyledBidirectionalText': processStyledBidirectionalText});
})();
