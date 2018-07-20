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
        ret = tryParseAsDataURI(filename);
        if (!ret) {
            if (!nodeFS)
                nodeFS = require('fs');
            if (!nodePath)
                nodePath = require('path');
            filename = nodePath['normalize'](filename);
            ret = nodeFS['readFileSync'](filename);
        }
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
            var data = tryParseAsDataURI(f);
            if (data) {
                return intArrayToString(data);
            }
            return read(f);
        };
    }
    Module['readBinary'] = function readBinary(f) {
        var data;
        data = tryParseAsDataURI(f);
        if (data) {
            return data;
        }
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
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('GET', url, false);
            xhr.send(null);
            return xhr.responseText;
        } catch (err) {
            var data = tryParseAsDataURI(url);
            if (data) {
                return intArrayToString(data);
            }
            throw err;
        }
    };
    if (ENVIRONMENT_IS_WORKER) {
        Module['readBinary'] = function readBinary(url) {
            try {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', url, false);
                xhr.responseType = 'arraybuffer';
                xhr.send(null);
                return new Uint8Array(xhr.response);
            } catch (err) {
                var data = tryParseAsDataURI(url);
                if (data) {
                    return data;
                }
                throw err;
            }
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
            var data = tryParseAsDataURI(url);
            if (data) {
                onload(data.buffer);
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
function getNativeTypeSize(type) {
    switch (type) {
    case 'i1':
    case 'i8':
        return 1;
    case 'i16':
        return 2;
    case 'i32':
        return 4;
    case 'i64':
        return 8;
    case 'float':
        return 4;
    case 'double':
        return 8;
    default: {
            if (type[type.length - 1] === '*') {
                return 4;
            } else if (type[0] === 'i') {
                var bits = parseInt(type.substr(1));
                return bits / 8;
            } else {
                return 0;
            }
        }
    }
}
function warnOnce(text) {
    if (!warnOnce.shown)
        warnOnce.shown = {};
    if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        err(text);
    }
}
var jsCallStartIndex = 1;
var functionPointers = new Array(0);
var funcWrappers = {};
function dynCall(sig, ptr, args) {
    if (args && args.length) {
        return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
    } else {
        return Module['dynCall_' + sig].call(null, ptr);
    }
}
var GLOBAL_BASE = 8;
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
function setValue(ptr, value, type, noSafe) {
    type = type || 'i8';
    if (type.charAt(type.length - 1) === '*')
        type = 'i32';
    switch (type) {
    case 'i1':
        HEAP8[ptr >> 0] = value;
        break;
    case 'i8':
        HEAP8[ptr >> 0] = value;
        break;
    case 'i16':
        HEAP16[ptr >> 1] = value;
        break;
    case 'i32':
        HEAP32[ptr >> 2] = value;
        break;
    case 'i64':
        tempI64 = [
            value >>> 0,
            (tempDouble = value, +Math_abs(tempDouble) >= +1 ? tempDouble > +0 ? (Math_min(+Math_floor(tempDouble / +4294967296), +4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / +4294967296) >>> 0 : 0)
        ], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
        break;
    case 'float':
        HEAPF32[ptr >> 2] = value;
        break;
    case 'double':
        HEAPF64[ptr >> 3] = value;
        break;
    default:
        abort('invalid type for setValue: ' + type);
    }
}
var ALLOC_STATIC = 2;
var ALLOC_NONE = 4;
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
function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343)
            u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127) {
            ++len;
        } else if (u <= 2047) {
            len += 2;
        } else if (u <= 65535) {
            len += 3;
        } else if (u <= 2097151) {
            len += 4;
        } else if (u <= 67108863) {
            len += 5;
        } else {
            len += 6;
        }
    }
    return len;
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
function demangle(func) {
    return func;
}
function demangleAll(text) {
    var regex = /__Z[\w\d_]+/g;
    return text.replace(regex, function (x) {
        var y = demangle(x);
        return x === y ? x : x + ' [' + y + ']';
    });
}
function jsStackTrace() {
    var err = new Error();
    if (!err.stack) {
        try {
            throw new Error(0);
        } catch (e) {
            err = e;
        }
        if (!err.stack) {
            return '(no stack trace available)';
        }
    }
    return err.stack.toString();
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
    abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
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
    {
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
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;
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
function exitRuntime() {
    callRuntimeCallbacks(__ATEXIT__);
    runtimeExited = true;
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
var Math_abs = Math.abs;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_min = Math.min;
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
var memoryInitializer = null;
var dataURIPrefix = 'data:application/octet-stream;base64,';
function isDataURI(filename) {
    return String.prototype.startsWith ? filename.startsWith(dataURIPrefix) : filename.indexOf(dataURIPrefix) === 0;
}
STATIC_BASE = GLOBAL_BASE;
STATICTOP = STATIC_BASE + 70784;
__ATINIT__.push({
    func: function () {
        ___emscripten_environ_constructor();
    }
});
memoryInitializer = 'data:application/octet-stream;base64,yAEAAOMRAQAYAAAAAAAAAMgBAACQEQEAKAAAAAAAAACgAQAAsREBAMgBAAC+EQEACAAAAAAAAADIAQAAKRIBABgAAAAAAAAAyAEAAAUSAQBAAAAAAAAAAAEAAAACAAAAVQ4BAHUPAQDfDQEA3w0BAH8NAQB1DwEA3w0BAN8NAQAdDwEATQ8BAN8NAQDfDQEAvQ4BAO0OAQDfDQEA3w0BAIUOAQAQDgEASA4BAE8OAQBVDgEApw0BAN8NAQDkDQEA6A0BABAOAQBIDgEATw4BAH8NAQCnDQEA3w0BAOQNAQAAEAAAAIAAAAAIAAAAQAAAqwAgALsAAAAVIiAEHyLgBCAi4AMhIqADIiLAAyQiwARDIiACRSJAAUwiIAGYIgAEpiJABKgigASpImAEqyKgBLgigAPNIgAB8iLgAvMiAAP0IiAD9iJAA/ciYAP6IkAC+yJgAvwigAL9IqAC/iLAAtwnAAKbKaAAoCnAAKMpgAC4KWAB9SlAAN4qgAHjKsAB5CqgAeUq4AHuKuAA/itgAAAAAAAIAAAAAQAAAAIAAAADAAAABAAAAAEAAAABAAAAAQAAAAEAAAAAAAAAMAAAAAEAAAAFAAAAAwAAAAQAAAABAAAAAgAAAAIAAAACAAAAcQZxBnsGewZ7BnsGfgZ+Bn4GfgYAAAAAAAAAAHoGegZ6BnoGAAAAAAAAAAB5BnkGeQZ5BgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAhgaGBoYGhgYAAAAAAAAAAI0GjQaMBowGjgaOBogGiAaYBpgGkQaRBqkGqQapBqkGrwavBq8GrwYAAAAAAAAAAAAAAAAAAAAAuga6BrsGuwa7BrsGwAbABsEGwQbBBsEGvga+Br4GvgbSBtIG0wbTBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAxwbHBsYGxgbIBsgGAADLBssGxQbFBskGyQbQBtAG0AbQBgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADMBswGzAbMBksGSwZMBkwGTQZNBk4GTgZPBk8GUAZQBlEGUQZSBlIGIQYiBiIGIwYjBiQGJAYlBiUGJgYmBiYGJgYnBicGKAYoBigGKAYpBikGKgYqBioGKgYrBisGKwYrBiwGLAYsBiwGLQYtBi0GLQYuBi4GLgYuBi8GLwYwBjAGMQYxBjIGMgYzBjMGMwYzBjQGNAY0BjQGNQY1BjUGNQY2BjYGNgY2BjcGNwY3BjcGOAY4BjgGOAY5BjkGOQY5BjoGOgY6BjoGQQZBBkEGQQZCBkIGQgZCBkMGQwZDBkMGRAZEBkQGRAZFBkUGRQZFBkYGRgZGBkYGRwZHBkcGRwZIBkgGSQZJBkoGSgZKBkoGXAZcBl0GXQZeBl4GXwZfBiERIRMBFSEXAxkhHQMfASMDJQMpAy0DMQM1ATkBOwE9AT8DQQNFA0kDTQNRA1UDWQNdAAAAAAAAAAAAAAMAA2EDZQNpE20DcQN1A3kBfQF/A4EEAYQBhAGEAYQBhAFEAwQBBAcECAQIBAEAAAAAAAAAAAAAAYUBhwGJAYsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQGCQAhACEAAAAhAAEAAQADAAsWCw4LAgMAAwALBgMAAwADAAMAAwADAAMACyoDAAk4AQABAAEACTQJMgk2AQABAAk8AQABAAEAAQABAAEACToBAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAMAAwADAAs+AwADAAMAAwADAAtCAwADAAMAAwADAAMAAwADAAMAAwAJTgtQAwADAAtaAwAJVAtWAQABAAEACZAJiQmHCYsJkgEACY4LrAEAAwADAAuUAwAJXglgXQRlBG0EdQSNBJUEnQSlBK0EtQS7BMMEywTTBNsE4wTpBPEE+QQBBQQFDAUUBRwFJAUsBSgFMAU4BUAFRQVNBVUFXQVhBWkFcQV5BYEFiQWFBY0FkgWaBaAFqAWwBbgFwAXIBdAF2AXdBeUF6AXwBfgFAAYGBg4GDQYVBh0GJQY1Bi0GPQZFBn0EVQZdBk0GbQZvBncGZQaHBo0GlQZ/BqUGqwazBp0GwwbJBtEGuwbhBucG7wbZBv8GBwcPB/cGHwclBy0HFwc9B0MHSwc1B1sHYAdoB1MHeAd/B4cHcAcJBo8Hlwd9BJ8HpwevB30Etwe/B8cHzAfUB9sH4wd9BMgF6wfzB/sHAwhVBRMICwjIBcgFyAXIBcgFyAXIBcgFyAXIBRsIyAUjCCcILwjIBTUIyAU7CEMISwhVBVUFUwhbCMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBWAIaAjIBcgFcAh4CIAIiAiQCMgFmAigCKgIuAjIBcAIwgjKCLAIyAXNCOEI1QjdCOkIyAXxCPcI/wgHCcgFFwkfCScJDwl9BH0ENwk6CUIJLwlSCUoJyAVZCcgFaAlhCXAJeAl8CYQJjAn9BJQJlwmdCaQJlwkkBawJrQStBK0ErQS0Ca0ErQStBMQJzAnUCdwJ5AnoCfAJvAkIChAK+AkAChgKIAooCjAKSAo4CkAKUApYCmcKbApfCnQKdAp0CnQKdAp0CnQKdAp8CoQK/wiHCo8KlgqbCqMK/wiqCqkKugq9Cv8I/wiyCv8I/wj/CP8I/wjMCtQKxAr/CP8I/wjZCv8I/wj/CP8I/wj/CP8I3wrnCv8I7wr2Cv8I/wj/CP8I/wj/CP8I/wh0CnQKdAp0Cv4KdAoFCwwLdAp0CnQKdAp0CnQKdAp0Cv8IFAsbCx8LJQv/CCsLpApVBTsLMwtDC60ErQStBEsL/QRTC8gFWQtpC2ELYQskBXELeQuBC30EiQv/CP8IkAv/CP8I/wj/CP8I/wiYC54LrgumCwkGyAW2C1sIyAW+C8YLygvIBcgFzwvXC/8I3wukCucL7Qv/COcL9Qv/CKQK/wj/CP8I/wj/CP8I/wj/CP0LyAXIBcgFBQzIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBQsMyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFEAzIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFzQj/CP8IGAzIBRsMyAUjDCkMMQw5DD4MyAXIBUIMyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFSQzIBVAMVgzIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFXgzIBcgFyAVmDMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAVoDMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFbwzIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBXYMyAXIBcgFfQyFDMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBYoMyAXIBZIMyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBZYMyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFmQzIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFnAzIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBaIMyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBaoMyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAWvDMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFtAzIBcgFyAW5DMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXBDMgMzAzIBcgFyAXTDMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXZDOkMyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBeEM/wjxDHAJyAXIBcgFyAXIBcgFyAXIBfYM/gytBA4NBg3IBcgFFg0eDS4NrQQzDTsNQQ19BCYNSQ1RDcgFWQ1pDWwNYQ10DR0GfA2DDcEIbQaTDYsNmw3IBaMNqw2zDcgFuw3DDcsN0w3bDd8N5w39BP0EyAXvDcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgF9w0DDvsNfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BAsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOyAXIBcgFGw7IBdQMIg4nDsgFyAXIBS8OyAXIBcwIfQRFDjUOPQ7IBcgFTQ5VDsgFyAXIBcgFyAXIBcgFyAXIBcgFWg5iDsgFZg7IBWwOcA54DoAOhw6PDsgFyAXIBZUOrQ5tBLUOvQ7CDuEInQ6lDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw4LDgsOCw70EfQRNBJ0ErQS7BIsE2wTpBPkExAUUBSQFKAU4BQUFVQVhBXEFQQWFBZIFoAWwBYAF0AXdBegF+AXGBg0GHQYgArACgALQAuAC0AKwAtACuILQApACkAKQAoiDNsB2wFiDKIMQApACkAKQAriDAINQApACkINgg3CDQIOQg6CDsIO+Q7bAdsBHQ9RD9sBeQ/bAdsB2wHbAaYP2wHbAdsB2wHbAdsB2wG6D9sB8g8yENsBPRDbAdsB2wFzEEAKsxBACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACvMQQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQApACkAKQAoABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABzMRAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAcABwAHAAczEX0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0Eyg7RDtkOfQTIBcgFyAXXC+kO4Q4AD/EO+A4ID4ULEA99BH0EfQR9BMEIyAUYDyAPyAUoDzAPNA88D8gFRA99BFUFXwVMD8gFUA9YD2gPYA/IBXAPyAV3D30EfQR9BH0EyAXIBcgFyAXIBcgFyAXIBcgFaQvNCGwOfQR9BH0EfQSHD38Pig+SD+EImg99BKIPqg+yD30EfQTIBcIPyg+6D9oP4Q/SD+kP8Q99BAEQ+Q/IBQQQDBAUEBwQJBB9BH0EyAXIBSwQfQRVBTQQ/QQ8EMgFRBB9BH0EfQR9BH0EfQR9BH0EfQRMEH0EfQR9BH0EVBBcEGMQfQR9BH0EfQR9BHMQ/gV7EGsQUgmDEIsQkRCpEJkQoRCtEFIJvRC1EMUQ1RDNEH0EfQTcEOQQIAbsEPwQAhEKEfQQfQR9BH0EfQTIBRIRGhF9BMgFIhEqEX0EfQR9BH0EfQTIBTIROhF9BMgFQhFKEVIRyAViEVoRfQQ7CGoRfQR9BH0EfQR9BH0EyAVyEX0EfQR9BFUF/QR6EX0EfQR9BH0EfQR9BH0EfQSSEYIRihHIBaIRmhHIBcIIfQR9BH0EfQR9BH0EfQR9BLgRvRGqEbIRzRHFEX0EfQTcEeAR1BHwEegRWhF9BH0EfQR9BH0EfQR9BH0EfQT0EX0EfQR9BH0EfQR9BH0EfQTIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcwIfQR9BH0EBBIMEhQS/BHIBcgFyAXIBcgFyAUcEn0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBSQSfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBSYSfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQTIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFwgjhCC4SfQR9BGIONhLIBT4SRhJOEtkMfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EVQX9BFYSfQR9BH0EyAXIBV4SYxJrEn0EfQRzEsgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBXsSyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBYMSfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQTIBcgFyAXIBcgFyAXIBcgF4Qh9BH0EYg7IBcgFyAXIBcgFyAXIBcgFyAXIBcgF+w19BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BMgFyAXIBYsSkBKYEn0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQT/CP8I/wj/CP8I/wj/CJgL/wigEv8IpxKvErUS/wi7Ev8I/wjDEn0EfQR9BH0EyxL/CP8IpgrTEn0EfQR9BH0E4xLqEu8S9RL9EgUTDRPnEhUTHRMlEyoT/BLjEuoS5hL1EjIT5BI1E+cSPRNFE00TVBNAE0gTUBNXE0MTXxPbEv8I/wj/CP8I/wj/CP8I/wj/CP8I/wj/CP8I/wj/CP8IJAVvEyQFdhN9E2cTfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EhBOME30EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQTIBcgFyAXIBcgFyAWUE30EVQWkE5wTfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0ErBO8E7QTfQR9BH0EfQR9BH0EfQR9BH0EfQTME9QT3BPkE+wT9BN9BMQTfQR9BH0EfQR9BH0EfQR9BP8I/BP/CP8IkAsBFAUUmAsNFP8I/wj8E/8IuhJ9BBUUHRQhFCkUMRR9BH0EfQR9BP8I/wj/CP8I/wj/CP8IORT/CP8I/wj/CP8I/wj/CP8I/wj/CP8I/wj/CP8I/wj/CP8I/wj/CP8I/wj/CEEUSRT/CP8I/wiQC/8I/whRFH0E/BP/CFkU/whhFJoLfQR9BPwTpAr/CGUU/whtFB0U/wh9BH0EfQSaC30EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR1FMgFyAV8FMgFyAXIBYQUyAWMFMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBXoMyAXIBZQUyAXIBcgFyAXIBcgFyAXIBcgFyAWcFKQUyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFuQzIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFqxTIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAWyFMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBbkUyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFaQt9BMgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBb0UyAXIBcgFyAXIBcgFUA/IBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAV/EsgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFyAXIBcgFwhR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EyAXIBcgFyAXKFMgFyAXIBcgFyAXIBcgFyAXIBcgFyAVQD30EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQTaFNIU0hTSFH0EfQR9BH0EJAUkBSQFJAUkBSQFJAXiFH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BH0EfQR9BBMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDhMOEw4TDuoUXAQPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADAAXABcAFwAZABcAFwAXABQAFQAXABgAFwATABcAFwBJAIkAyQAJAUkBiQHJAQkCSQKJAhcAFwAYABgAGAAXABcAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABABQAFwAVABoAFgAaAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAUABgAFQAYAA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADwAPAA8ADAAXABkAGQAZABkAGwAXABoAGwAFABwAGAAQABsAGgAbABgASwOLAxoAAgAXABcAGgALAwUAHQDLNEs0yzwXAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAYAAEAAQABAAEAAQABAAEAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAGAACAAIAAgACAAIAAgACAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAIAAQACAAEAAgABAAIAAQACAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAEAAgABAAIAAQACAAIAAgABAAEAAgABAAIAAQABAAIAAQABAAEAAgACAAEAAQABAAEAAgABAAEAAgABAAEAAQACAAIAAgABAAEAAgABAAEAAgABAAIAAQACAAEAAQACAAEAAgACAAEAAgABAAEAAgABAAEAAQACAAEAAgABAAEAAgACAAUAAQACAAIAAgAFAAUABQAFAAEAAwACAAEAAwACAAEAAwACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgACAAEAAwACAAEAAgABAAEAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgACAAIAAgACAAIAAgABAAEAAgABAAEAAgACAAEAAgABAAEAAQABAAIAAQACAAEAAgABAAIAAQACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAUAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAGgAaABoAGgAEAAQABAAEAAQABAAEAAQABAAEAAQABAAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoABAAEAAQABAAEABoAGgAaABoAGgAaABoABAAaAAQAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAQACAAEAAgAEABoAAQACAAAAAAAEAAIAAgACABcAAQAAAAAAAAAAABoAGgABABcAAQABAAEAAAABAAAAAQABAAIAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAQABAAEAAQABAAEAAQABAAEAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAEAAgACAAEAAQABAAIAAgACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAIAAgACAAIAAQACABgAAQACAAEAAQACAAIAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAGwAGAAYABgAGAAYABwAHAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAAAAAAQAFwAXABcAFwAXABcAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAFwATAAAAAAAbABsAGQAAAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGABMABgAXAAYABgAXAAYABgAXAAYAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAABQAFAAUABQAXABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABgAGAAYABcAFwAZABcAFwAbABsABgAGAAYABgAGAAYABgAGAAYABgAGABcAEAAAABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABAAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAEkAiQDJAAkBSQGJAckBCQJJAokCFwAXABcAFwAFAAUABgAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFABcABQAGAAYABgAGAAYABgAGABAAGwAGAAYABgAGAAYABgAEAAQABgAGABsABgAGAAYABgAFAAUASQCJAMkACQFJAYkByQEJAkkCiQIFAAUABQAbABsABQAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAAAAQAAUABgAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAYABgAGAAYABgAGAAYABgAGAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAYABgAGAAYABgAGAAYABAAEABsAFwAXABcABAAAAAAABgAZABkABgAGAAYABgAEAAYABgAGAAQABgAGAAYABgAGAAAAAAAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAYABgAEAAYABgAGAAYABgAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAAAAAAXAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABgAQAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAUABQAGAAYAFwAXAEkAiQDJAAkBSQGJAckBCQJJAokCFwAEAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAIAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYACAAGAAUACAAIAAgABgAGAAYABgAGAAYABgAGAAgACAAIAAgABgAIAAgABQAGAAYABgAGAAYABgAGAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgUABQAZABkAyzfLNcs/yzTLPEsJGwAZAAUAFwAGAAAABQAGAAgACAAAAAUABQAFAAUABQAFAAUABQAAAAAABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAAAAAAAAAFAAUABQAFAAAAAAAGAAUACAAIAAgABgAGAAYABgAAAAAACAAIAAAAAAAIAAgABgAFAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAABQAFAAAABQAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgYABgAFAAUABQAGABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAYACAAAAAUABQAFAAUABQAFAAAAAAAAAAAABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAAABQAFAAAABQAFAAAAAAAGAAAACAAIAAgABgAGAAAAAAAAAAAABgAGAAAAAAAGAAYABgAAAAAAAAAGAAAAAAAAAAAAAAAAAAAABQAFAAUABQAAAAUAAAAFAAUABgAGAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAhcAGQAAAAAAAAAAAAAAAAAAAAUABgAGAAYABgAGAAYAAAAGAAYACAAAAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAAABQAFAAUABQAFAAAAAAAGAAUACAAIAAgABgAGAAYABgAGAAAABgAGAAgAAAAIAAgABgAAAAAABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABgAGAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAhsABQDLNEs0yzzLN8s1yz8AAAAAAAAAAAAAAAAAAAAAAAAGAAgACAAAAAUABQAFAAUABQAFAAUABQAAAAAABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAAABQAFAAUABQAFAAAAAAAGAAUACAAGAAgABgAGAAYABgAAAAAACAAIAAAAAAAIAAgABgAAAAAAAAAAAAAAAAAAAAAABgAIAAAAAAAAAAAABQAFAAAABQAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAssHSx5LeBsAGwAbABsAGwAbABkAGwAAAAAAAAAAAAAAAAAAAAYABQAAAAUABQAFAAUABQAFAAAAAAAAAAUABQAFAAAABQAFAAUABQAAAAAAAAAFAAUAAAAFAAAABQAFAAAAAAAAAAUABQAAAAAAAAAFAAUABQAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAgACAAGAAgACAAAAAAAAAAIAAgACAAAAAgACAAIAAYAAAAAAAUAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAABQAFAAYABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAAAAAASwWLBcsFCwaLBcsFCwYbAAYACAAIAAgABgAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAFAAYABgAGAAgACAAIAAgAAAAGAAYABgAAAAYABgAGAAYAAAAAAAAAAAAAAAAAAAAGAAYAAAAFAAUABQAAAAAAAAAAAAAABQAFAAYABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABgAIAAgAFwAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAAAAAABgAFAAgABgAIAAgACAAIAAgAAAAGAAgACAAAAAgACAAGAAYAAAAAAAAAAAAAAAAAAAAIAAgAAAAAAAAAAAAAAAAAAAAFAAAABQAFAAYABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQLLB0seS3jLNEs0yzzLN8s1yz8bAAUABQAFAAUABQAFAAYABgAIAAgAAAAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABQAIAAgACAAGAAYABgAGAAAACAAIAAgAAAAIAAgACAAGAAUAGwAAAAAAAAAAAAUABQAFAAgAC8wLykvLC8lLNkvJCzUFAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAgACAAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUAAAAFAAAAAAAFAAUABQAFAAUABQAFAAAAAAAAAAYAAAAAAAAAAAAIAAgACAAGAAYABgAAAAYAAAAIAAgACAAIAAgACAAIAAgABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABQAFAAYABgAGAAYABgAGAAYAAAAAAAAAAAAZAAUABQAFAAUABQAFAAQABgAGAAYABgAGAAYABgAGABcASQCJAMkACQFJAYkByQEJAkkCiQIXABcAAAAAAAAAAAAAAAUABQAAAAUAAAAAAAUABQAAAAUAAAAAAAUAAAAAAAAAAAAAAAAABQAFAAUABQAAAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAUAAAAFAAAAAAAFAAUAAAAFAAUABQAFAAYABQAFAAYABgAGAAYABgAGAAAABgAGAAUAAAAAAAUABQAFAAUABQAAAAQAAAAGAAYABgAGAAYABgAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAAABQAFAAUABQAFABsAGwAbABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABsAFwAbABsAGwAGAAYAGwAbABsAGwAbABsASQCJAMkACQFJAYkByQEJAkkCiQJLNEs8S0RLTEtUS1xLZEtsS3RLLBsABgAbAAYAGwAGABQAFQAUABUACAAIAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAgABgAGAAYABgAGABcABgAGAAUABQAFAAUABQAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAbABsAGwAbABsAGwAbABsABgAbABsAGwAbABsAGwAAABsAGwAXABcAFwAXABcAGwAbABsAGwAXABcAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgABgAGAAYABgAIAAYABgAGAAYABgAGAAgABgAGAAgACAAGAAYABQBJAIkAyQAJAUkBiQHJAQkCSQKJAhcAFwAXABcAFwAXAAUABQAFAAUABQAFAAgACAAGAAYABQAFAAUABQAGAAYABgAFAAgACAAIAAUABQAIAAgACAAIAAgACAAIAAUABQAFAAYABgAGAAYABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAgACAAGAAYACAAIAAgACAAIAAgABgAFAAgASQCJAMkACQFJAYkByQEJAkkCiQIIAAgACAAGABsAGwACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAXAAQAAgACAAIAAQABAAEAAQABAAEAAAABAAAAAAAAAAAAAAABAAAAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAAAAAABQAFAAUABQAFAAUABQAAAAUAAAAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUAAAAAAAUABQAFAAUABQAFAAUAAAAFAAAABQAFAAUABQAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAABgAGAAYAFwAXABcAFwAXABcAFwAXABcACwNLA4sDywMLBEsEiwTLBAsFywdLCssMSw/LEUsUyxZLGcsbSx6LeAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAAACAAIAAgACAAIAAgAAAAAAEwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAFwAXAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAMAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAUABUAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFABcAFwAXAIoJygkKCgUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAYABgAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAXABcAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAAAAYABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAgABgAGAAYABgAGAAYABgAIAAgACAAIAAgACAAIAAgABgAIAAgABgAGAAYABgAGAAYABgAGAAYABgAGABcAFwAXAAQAFwAXABcAGQAFAAYAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAAAAAASwWLBcsFCwZLBosGywYLB0sHiwcAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAGAAUAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAFwAXABcAFwAXABcAEwAXABcAFwAXAAYABgAGABAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAAAUABQAFAAQABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAYABgAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABgAGAAgACAAIAAgABgAGAAgACAAIAAAAAAAAAAAACAAIAAYACAAIAAgACAAIAAgABgAGAAYAAAAAAAAAAAAbAAAAAAAAABcAFwBJAIkAyQAJAUkBiQHJAQkCSQKJAgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgsDAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAgACAAGAAAAAAAXABcAFwAXABcAFwAXABcAFwAEABcAFwAXABcAFwAXAAAAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABwAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgABgAIAAYABgAGAAYABgAGAAYAAAAGAAgABgAIAAgABgAGAAYABgAGAAYABgAGAAgACAAIAAgACAAIAAYABgAGAAYABgAGAAYABgAGAAYAAAAAAAYASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAABcAGwAbABsAGwAbABsAGwAbABsAGwAGAAYABgAGAAYABgAGAAYABgAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAGAAYABgAGAAgABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAIAAYABgAGAAYABgAIAAYACAAIAAgACAAIAAYACAAIAAUABQAFAAUABQAFAAUAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAhcAFwAXABcAFwAXAAUACAAGAAYABgAGAAgACAAGAAYACAAGAAYABgAFAAUASQCJAMkACQFJAYkByQEJAkkCiQIFAAUABQAFAAUABQAGAAYACAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYACAAGAAYACAAIAAgABgAIAAYABgAGAAgACAAAAAAAAAAAAAAAAAAAAAAAFwAXABcAFwBJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAUABQAFAEkAiQDJAAkBSQGJAckBCQJJAokCBQAFAAUABQAFAAUACAAIAAgACAAIAAgACAAIAAYABgAGAAYABgAGAAYABgAIAAgABgAGAAAAAAAAABcAFwAXABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAEAAQABAAEAAQABAAXABcAAgACAAIAAgACAAIAAgACAAIAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAAAAAAQABAAEAFwAXABcAFwAXABcAFwAXAAAAAAAAAAAAAAAAAAAAAAAGAAYABgAXAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYACAAGAAYABgAGAAYABgAGAAUABQAFAAUABgAFAAUABQAFAAgACAAGAAUABQAIAAYABgAAAAAAAAAAAAAAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAEAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAQABAAEAAQABAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAGAAYABgAGAAYAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgACAAIAAgACAAIAAgACAAIAAQACAAIAAgACAAIAAgACAAIAAgABAAEAAQABAAEAGgAaABoAAAAAAAIAAgACAAAAAgACAAEAAQABAAEAAwAaABoAAAACAAIAAgACAAIAAgACAAIAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAAAAAABAAEAAQABAAEAAQAAAAAAAgACAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAIAAgACAAIAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAAAAAABAAEAAQABAAEAAQAAAAAAAgACAAIAAgACAAIAAgACAAAAAQAAAAEAAAABAAAAAQACAAIAAgACAAIAAgACAAIAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAAAAAAAgACAAIAAgACAAIAAgACAAMAAwADAAMAAwADAAMAAwACAAIAAgACAAIAAgACAAIAAwADAAMAAwADAAMAAwADAAIAAgACAAIAAgAAAAIAAgABAAEAAQABAAMAGgACABoAGgAaAAIAAgACAAAAAgACAAEAAQABAAEAAwAaABoAGgACAAIAAgACAAAAAAACAAIAAQABAAEAAQAAABoAGgAaABYAFwAXABcAGAAUABUAFwAXABcAFwAXABcAFwAXABcAFwAXABgAFwAWABcAFwAXABcAFwAXABcAFwAXABcADAAQABAAEAAQABAAAAAQABAAEAAQABAAEAAQABAAEAAQAMsCBAAAAAAAywMLBEsEiwTLBAsFGAAYABgAFAAVAAQADAAMAAwADAAMAAwADAAMAAwADAAMABAAEAAQABAAEAATABMAEwATABMAEwAXABcAHAAdABQAHAAcAB0AFAAcABcAFwAXABcAFwAXABcAFwANAA4AEAAQABAAEAAQAAwAFwAXABcAFwAXABcAFwAXABcAHAAdABcAFwAXABcAFgDLAgsDSwOLA8sDCwRLBIsEywQLBRgAGAAYABQAFQAAAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAAAAAAAAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZABkAGQAZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAHAAcABwAHAAYABwAHAAcABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwABABsAAQAbAAEAGwABAAEAAQABABsAAgABAAEAAQABAAIABQAFAAUABQACABsAGwACAAIAAQABABgAGAAYABgAGAABAAIAAgACAAIAGwAYABsAGwACABsAizULNks2izSLOAs1CzkLPQtBSzVLRcs1yz3LRctNiwUbABsAAQAbABsAGwAbAAEAGwAbAAIAAQABAAEAAgACAAEAAQABAAIAGwABABsAGwAYAAEAAQABAAEAAQAbABsAigXKBQoGSgaKBsoGCgdKB4oHygcKCEoIyhFKHgqYSniKBcoFCgZKBooGygYKB0oHigfKBwoISgjKEUoeCphKeEp4SpiKeAEAAgDKBsoRipjKeEsFGwAbAAAAAAAAAAAAGAAYABgAGAAYABsAGwAbABsAGwAYABgAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGwAbABgAGwAbABgAGwAbABsAGwAbABsAGwAYABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAYABsAGwAYABsAGAAbABsAGwAbABsAGwAbABsAGwAbABsAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABsAGwAbABsAGwAbABsAGwAUABUAFAAVABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAYABgAGwAbABsAGwAbABsAGwAUABUAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABgAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAYABgAGAAYABgAGAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAywILCEsIiwjLCAsJSwmLCcsJCwpLCgsDSwOLA8sDCwRLBIsEywQLBcsHywILA0sDiwPLAwsESwSLBMsECwXLBwsISwiLCMsICwlLCYsJywkLCksKCwNLA4sDywMLBEsEiwTLBAsFywcLCEsIiwjLCAsJSwmLCcsJCwpLChsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABgAGAAYABgAGAAYABgAGAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAbABsAGwAbABsAGwAbABsAGwAYABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABgAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAUABUAFAAVABQAFQAUABUAFAAVABQAFQAUABUACwNLA4sDywMLBEsEiwTLBAsFywcLA0sDiwPLAwsESwSLBMsECwXLBwsDSwOLA8sDCwRLBIsEywQLBcsHGwAbABsAGwAbABsAGwAbABsAGwAbABsAGAAYABgAGAAYABQAFQAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAUABUAFAAVABQAFQAUABUAFAAVABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAFAAVABQAFQAUABUAFAAVABQAFQAUABUAFAAVABQAFQAUABUAFAAVABQAFQAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAUABUAFAAVABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAFAAVABgAGAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAbABsAGAAYABgAGAAYABgAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAGwAbABsAGwAbABsAGwAbABsAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAQACAAEAAQABAAIAAgABAAIAAQACAAEAAgABAAEAAQABAAIAAQACAAIAAQACAAIAAgACAAIAAgAEAAQAAQABAAEAAgABAAIAAgAbABsAGwAbABsAGwABAAIAAQACAAYABgAGAAEAAgAAAAAAAAAAAAAAFwAXABcAFwBLNBcAFwACAAIAAgACAAIAAgAAAAIAAAAAAAAAAAAAAAIAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAEABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAXABcAHAAdABwAHQAXABcAFwAcAB0AFwAcAB0AFwAXABcAFwAXABcAFwAXABcAEwAXABcAEwAXABwAHQAXABcAHAAdABQAFQAUABUAFAAVABQAFQAXABcAFwAXABcABAAXABcAFwAXABcAFwAXABcAFwAXABMAEwAXABcAFwAXABMAFwAUABcAFwAXABcAFwAXABcAFwAXABcAFwAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAGwCKBcoFCgZKBooGygYKB0oHigcGAAYABgAGAAgACAATAAQABAAEAAQABAAbABsAygdKCsoMBAAFABcAGwAbAAwAFwAXABcAGwAEAAUASgUUABUAFAAVABQAFQAUABUAFAAVABsAGwAUABUAFAAVABQAFQAUABUAEwAUABUAFQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAYABgAaABoABAAEAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAFwAEAAQABAAFAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAGwAbAIsFywULBksGGwAbABsAGwAbABsAGwAbABsAGwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIsFywULBksGiwbLBgsHSweLB8sHGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwDLB0sKywxLD8sRSxTLFksZGwCLCssKCwtLC4sLywsLDEsMiwzLDAsNSw2LDcsNCw4bABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsASw6LDssOCw9LD4sPyw8LEEsQixDLEAsRSxGLEcsRBQAFAAUABQAFAIUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUFBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUHBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhQUFAAUABQcFAAUABQCFeAUABQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIUHBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUFBQAFAAUABQAFAAUABQCFBgUARQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhXnFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEV4BQAFAAUABQAFAAUABQAFAAUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFHgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIV5BQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIV6BQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUFBQBFBwUAxQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUHBQBFeEUKxQwFAAUABQAFAAUABQBFDwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFBgUGBQYFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIUFBQAFAAUABQAFAAUABQCFBQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAhQUFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIUHRQoFAAUABQAFAAUABQAFAAUABQAFAAUABQCFBcUFBQYFAMUFBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAxQcFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEUHBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQcFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUARR4FAAUABQAFAAUABQAFAEUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCFeAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUFBQAFAAUABQDFBQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAxQUFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEV4BQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUGBQAFAAUABQAFAEUeBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAxQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEUFBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAQABQAFAAUABQAFAAUABQAFAAUABQAbABsAGwAbABsAGwAbAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABAAXABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEkAiQDJAAkBSQGJAckBCQJJAokCBQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAQABAAGAAYAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAUABgAHAAcABwAXAAYABgAGAAYABgAGAAYABgAGAAYAFwAEAAUABQAFAAUABQAFAIoFygUKBkoGigbKBgoHSgeKB0oFBgAGABcAFwAXABcAFwAXAAAAAAAAAAAAAAAAAAAAAAAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoABAAEAAQABAAEAAQABAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABAAEAAIABQAFAAUABQAFABoAGgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAgACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAIAAQACAAQAAgACAAIAAgACAAIAAgACAAEAAgABAAIAAQABAAIAAQACAAEAAgABAAIAAQACAAQAGgAaAAEAAgABAAIABQABAAIAAQACAAIAAgABAAIAAQACAAEAAgABAAIAAQACAAEAAgABAAEAAQABAAEAAgABAAEAAQABAAEAAgABAAIAAQACAAAAAAAAAAAAAAAAAAUABQAGAAUABQAFAAYABQAFAAUABQAGAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgABgAGAAgAGwAbABsAGwAAAAAAAAAAAMs0SzTLPMs3yzXLPxsAGwAZABsAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFABcAFwAXABcAAAAAAAAAAAAAAAAAAAAAAAgACAAIAAgABgAGAAAAAAAAAAAAAAAAAAAAAAAXABcASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAIAAgABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUACAAIAAgACAAIAAgACAAIAAgACAAIAAgABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABQAFAAUABQAFAAUAFwAXABcABQAXAAUABQAGAAUABQAFAAUABQAFAAYABgAGAAYABgAGAAYABgAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAGAAYABgAGAAYABgAGAAYACAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAXAAgAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAAAAQASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYACAAIAAYABgAGAAYACAAIAAYACAAIAAgABQAFAAUABQAFAAYABAAFAAUABQAFAAUABQAFAAUABQBJAIkAyQAJAUkBiQHJAQkCSQKJAgUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAYABgAGAAgACAAGAAYACAAIAAYABgAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAGAAUABQAFAAUABQAFAAUABQAGAAgAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAABcAFwAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAEAAUABQAFAAUABQAFABsAGwAbAAUACAAGAAgABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAFAAYABgAGAAUABQAGAAYABQAFAAUABQAFAAYABgAFAAYABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABAAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAgABgAGAAgACAAXABcABQAEAAQACAAGAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUAAAAAAAUABQAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAAAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACABoABAAEAAQABAACAAIAAgACAAIAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIABQAFAAUACAAIAAYACAAIAAYACAAIABcACAAGAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAUABQAFAAUABQAFAAUAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARAAUABQAFAAUABQAFAAUABQAFAAUABQAFBgUABQAFAAUABQAFAAUAxQcFAAUABQAFAMUFBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAMUGBQDFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAYAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUAAAAFAAAABQAFAAAABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAIAAgACAAIAAgACAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgACAAIAAgACAAAAAAAAAAAAAAAFAAYABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFABUAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAZABsAAAAAAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAFwAXABcAFwAXABcAFwAUABUAFwAAAAAAAAAAAAAAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGABcAEwATABYAFgAUABUAFAAVABQAFQAUABUAFAAVABQAFQAXABcAFAAVABcAFwAXABcAFgAWABYAFwAXABcAAAAXABcAFwAXABMAFAAVABQAFQAUABUAFwAXABcAGAATABgAGAAYAAAAFwAZABcAFwAAAAAAAAAAAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAABAAAAAAAAUABQAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAAAAAABQAFAAUABQAFAAUAAAAAAAUABQAFAAAAAAAAABkAGQAYABoAGwAZABkAAAAbABgAGAAYABgAGwAbAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAGwAbAAAAAAAAABcAFwAXABkAFwAXABcAFAAVABcAGAAXABMAFwAXAEkAiQDJAAkBSQGJAckBCQJJAokCFwAXABgAGAAYABcAGgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAFAAYABUAGAAUABUAFwAUABUAFwAXAAUABQAFAAUABQAFAAUABQAFAAUABAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAEAAQABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAuwC7hLeEuAS4hLkEuYS6BLqEuwS7iLeIuAi4iLkIuYi6CLqIuwi7gAAAAAAAAbABsAGwAbABsAGwAbABsAGwAXABcAFwAAAAAAAAAAAIsFywULBksGiwbLBgsHSweLB8sHSwrLDEsPyxFLFMsWSxnLG0seC4ALiAuQC5gLoAuoygfKB8oHygfKB8oMyhHKEcoRyhFKHgqICpgKmAqYCpgKmEp4SpiKBsoRSzRLNIs4yzwbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAEsFyzQbABsAGwAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAyjRKNIoFigbKEQqYSpiKmIoGygfKEUoeCphKeEqYigbKB8oRSh4KmEp4iniKmMoHigWKBYoFygXKBcoFygWKBhsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsABgAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAiwXLBQsGSwaLBssGCwdLB4sHywdLCssMSw/LEUsUyxZLGcsbSx4LgAuIC5ALmAugC6gLsAu4AAAAAAAAAACLBYsGywfLEQAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQDKGwUABQAFAAUABQAFAAUABQAKuAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAYABgAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAXAAUABQAFAAUAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUAFwCKBcoFygdKCkoeAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAAAAAAAAAAAIAAgACAAIAAgACAAIAAgAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAAAAAAAAAUAAAAAAAUABQAFAAUABQAFAAUAAAAAAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAABcAiwXLBQsGywdLCkseS3iLeAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAbABsAiwXLBQsGSwaLBssHSwoAAAAAAAAAAAAAAAAAAIsFywULBksGSwaLBssHSwpLHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAAAAAAAAAAAAAAiwWLBssHSwpLHgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAiwXLB0sKSx7LBQsGAAAAAAAAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAABcAS6BLqEuwS7iLeIuAi4iLkIuYi6CLqIuwi7jLeMuAy4jLkMuYy6DLqMuwy7jLNks1yzSLNMtGSzTLTos4yzxLRQUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAy15LNAUABQCLBcsFCwZLBosGywYLB0sHiwfLB0sKywxLD8sRSxTLFgAAAABLHguAC4gLkAuYC6ALqAuwC7hLeEuAS4hLkEuYCwNLA4sDywPLB0sKSx5LeEs0AAAAAAAAAAAAAAAAAAAXABcAFwAXABcAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAUABgAGAAYAAAAGAAYAAAAAAAAAAAAAAAYABgAGAAYABQAFAAUABQAAAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAABgAGAAYAAAAAAAAAAAAGAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCLBcsRFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAiwXLB0sKBQAFAAUABQAFAAYABgAAAAAAAAAAAIsFiwbLB0sKSx4XABcAFwAXABcAFwAXAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAbAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAFwAXABcAFwAXABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAACLBcsFCwZLBssHSwpLHkt4BQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAAiwXLBQsGSwbLB0sKSx5LeAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACLBcsFCwZLBssHSwpLHgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAAAAAAAAAAAAAAAiwWLBssHyxFLHkt4BQAFAAUABQAGAAYABgAGAAAAAAAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAAAsDSwOLA8sDCwRLBIsEywQLBcsHSwrLDEsPyxFLFMsWSxnLG0seC4ALiAuQC5gLoAuoC7ALuEs0yzSLNIs4AAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAiwXLBQsGSwaLBssHSwrLDEseSzQFAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAGAAYABgAGAAYABgAGAAYAiwXLB0sKSx4XABcAFwAXABcAAAAAAAAAAAAAAAAASxTLFksZyxtLHkt4SQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAgABgAIAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAGAAYABgAGABcAFwAXABcAFwAXABcAAAAAAAAAAAALA0sDiwPLAwsESwSLBMsECwXLB0sKywxLD8sRBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgACAAGAAYABgAGAAgACAAGAAYAFwAXABAAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAYABgAGAAYABgAIAAYABgAGAAYABgAGAAYABgAAAEkAiQDJAAkBSQGJAckBCQJJAokCFwAXABcAFwAFAAgACAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAYABgAGAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGABcAFwAFAAAAAAAAAAAAAAAAAAAAAAAAAAgABQAFAAUABQAXABcAFwAXAAYABgAGAAYAFwAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIFABcABQAXABcAFwAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgACAAIAAYABgAGAAYABgAGAAYABgAGAAgAAACLBcsFCwZLBosGywYLB0sHiwfLB0sKywxLD8sRSxTLFksZyxtLHkt4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgACAAIAAYABgAGAAgACAAGAAgABgAGABcAFwAXABcAFwAXAAYAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAAABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAXAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUACAAIAAgABgAGAAYABgAGAAYABgAGAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAAAAAAAUABQAIAAgAAAAAAAYABgAGAAYABgAGAAYAAAAAAAAABgAGAAYABgAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAYACAAIAAAABQAFAAUABQAFAAUABQAFAAAAAAAFAAUAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUAAAAFAAUAAAAFAAUABQAFAAUAAAAGAAYABQAIAAgABgAIAAgACAAIAAAAAAAIAAgAAAAAAAgACAAIAAAAAAAFAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgACAAIAAYABgAGAAYABgAGAAYABgAIAAgABgAGAAYACAAGAAUABQAFAAUAFwAXABcAFwAXAEkAiQDJAAkBSQGJAckBCQJJAokCAAAXAAAAFwAGAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgACAAGAAYABgAGAAYABgAIAAYACAAIAAgACAAGAAYACAAGAAYABQAFABcABQAAAAAAAAAAAAAAAAAAAAAASQCJAMkACQFJAYkByQEJAkkCiQIAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAIAAgACAAGAAYABgAGAAAAAAAIAAgACAAIAAYABgAIAAYABgAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAXABcABQAFAAUABQAGAAYAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUACAAIAAgABgAGAAYABgAGAAYABgAGAAgACAAGAAgABgAGABcAFwAXAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAAAAAAFwAXABcAFwAXABcAFwAXABcAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABgAIAAYACAAIAAYABgAGAAYABgAGAAgABgAAAAAAAAAAAAAAAAAAAAAACAAIAAYABgAGAAYACAAGAAYABgAGAAYAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAssHSwoXABcAFwAbAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgACAAIAAYABgAGAAYABgAGAAYABgAGAAgABgAGABcAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAssHSwrLDEsPyxFLFMsWSxnLGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYABgAGAAYABgAIAAUABgAGAAYABgAXABcAFwAXABcAFwAXABcABgAAAAAAAAAAAAAAAAAAAAAABQAGAAYABgAGAAYABgAIAAgABgAGAAYABQAFAAUABQAFAAYABgAGAAYABgAGAAYABgAGAAYABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAFwAXABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUAAAAAAAUABQAFAAUABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAIAAYABgAXABcAFwAFABcAFwAFABcAFwAXABcAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCiwXLBQsGSwaLBssGCwdLB4sHywdLCssMSw/LEUsUyxZLGcsbSx4AAAAAAAAXABcABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAgABgAGAAYABgAGAAYABgAAAAYABgAGAAYABgAGAAgABgAGAAYABgAGAAYABgAGAAYAAAAIAAYABgAGAAYABgAGAAYACAAGAAYACAAGAAYAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAFAAYAAAAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAAAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAYABgAGAAYAAAAAAAAABgAAAAYABgAAAAYABQAFAAUABQAFAAUABQAFAAUABQAIAAgACAAIAAgAAAAGAAYAAAAIAAgABgAIAAYABQAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAAABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAGAAYACAAIABcAFwAAAAAAAAAAAAAAAAAAAMo0SjXKNMo0SjSKNIo4Sg/KEUoGigbKBgoHSgeKBwAAFwAXABcAFwAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADKBQoGSgaKBsoGCgdKB4oHCgZKBooGygYKB0oHigdKBooGygYKB0oHigeKBcoFCgZKBooGygYKB0oHigeKBcoFCgZKBooGygUKBgoGSgaKBsoGCgdKB4oHigXKBQoGCgZKBooGisCKwYoFygUKBgoGSgaKBgoGCgZKBkoGSgZKBsoGCgcKBwoHSgdKB4oHigeKB4oHygUKBkoGigbKBooFygUKBkoGSgaKBooGygUKBooFygWKNIo4SkWKNIo4yjUFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABJAIkAyQAJAUkBiQHJAQkCSQKJAgAAAAAAAAAAFwAXAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAGAAYABgAGAAYAFwAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABgAGAAYABgAGAAYABgAXABcAFwAXABcAGwAbABsAGwAEAAQABAAEABcAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAADLB0sei3gLeYt5C3qLegAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAUABQAFAEsFiwXLBQsGSwaLBssGCwdLB4sHywcLCEsIiwjLCAsJSwmLCcsJCwqLBcsFCwYXABcAFwAXAAAAAAAAAAAAAAAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYABgAGAAYABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAbAAYABgAXABAAEAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAIAAgABgAGAAYAGwAbABsACAAIAAgACAAIAAgAEAAQABAAEAAQABAAEAAQAAYABgAGAAYABgAGAAYABgAbABsABgAGAAYABgAGAAYABgAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAYABgAGAAYAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwAbAAYABgAGABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEsFiwXLBQsGSwaLBssGCwdLB4sHywcLCEsIiwjLCAsJSwmLCcsJCwoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACLBcsFCwZLBosGywYLB0sHiwfLB0sKywxLD8sRSxTLFksZyxuLBcsFCwZLBosGiwWLBgAAAAAAAAAAAAAAAAAASQKJAkkAiQDJAAkBSQGJAckBCQJJAokCSQCJAMkACQFJAYkByQEJAkkCiQJJAIkAyQAJAUkBiQHJAQkCSQKJAgEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAIAAgACAAAAAgACAAIAAgACAAIAAgACAAIAAgABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAEAAAABAAEAAAAAAAEAAAAAAAEAAQAAAAAAAQABAAEAAQAAAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAAAAgAAAAIAAgACAAIAAgACAAIAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACAAIAAgACAAEAAQAAAAEAAQABAAEAAAAAAAEAAQABAAEAAQABAAEAAQAAAAEAAQABAAEAAQABAAEAAAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAQABAAAAAQABAAEAAQAAAAEAAQABAAEAAQAAAAEAAAAAAAAAAQABAAEAAQABAAEAAQAAAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAIAAgACAAIAAgACAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABABgAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAYAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAGAACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAYAAIAAgACAAIAAgACAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAgACAAIAGAACAAIAAgACAAIAAgABAAIAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCSQCJAMkACQFJAYkByQEJAgAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAGwAbABsAGwAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYAGwAbABsAGwAbABsAGwAbAAYAGwAbABsAGwAbABsAGwAbABsAGwAGABsAGwAXABcAFwAXABcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAGAAYABgAGAAYABgAGAAAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAAAAAAGAAYABgAGAAYABgAGAAAABgAGAAAABgAGAAYABgAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAUABQAFAAUABQAAAAAAiwXLBQsGSwaLBssGCwdLB4sHBgAGAAYABgAGAAYABgAAAAAAAAAAAAAAAAAAAAAAAAACAAIAAgACAAYABgAGAAYABgAGAAYAAAAAAAAAAAAAAEkAiQDJAAkBSQGJAckBCQJJAokCAAAAAAAAAAAXABcAAQABAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACLBcsFCwZLBosGywYLB0sHiwfLB0sKywxLD8sRSxTLeEt5S4GLBcsFCwZLBosGywYLB0sHiwcbAMs0SzTLPBkAiwXLBYt4y3gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAyxZLGcsbSx4LgAuIC5ALmAugC6gLsAu4S3hLgEuIS5BLmEugS6hLsEu4i3iLgIuIi5CLmIugi6iLsIu4y3jLgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGAAYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAFAAUABQAFAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAFAAUAAAAFAAAAAAAFAAAABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUAAAAFAAAABQAAAAAAAAAAAAAAAAAFAAAAAAAAAAAABQAAAAUAAAAFAAAABQAFAAUAAAAFAAUAAAAFAAAAAAAFAAAABQAAAAUAAAAFAAAABQAAAAUABQAAAAUAAAAAAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAAABQAFAAUABQAAAAUABQAFAAUAAAAFAAAABQAFAAUABQAFAAUABQAFAAUABQAAAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAAAAAAAAAAAAAABQAFAAUAAAAFAAUABQAFAAUAAAAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAywLLAgsDSwOLA8sDCwRLBIsEywQLBUsFSwUAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABoAGgAaABoAGgAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAABsAGwAbABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAGwAbABsAAAAAABsAGwAbABsAAAAAAAAAGwAAABsAGwAbABsAGwAbABsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAbABsAGwAbABsAGwAbABsAGwAbAAAAAAAAAAAAAAAAAAUABQcFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAIUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAxQwFAAUABQAFAAUABQAFAAUARQ8FAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQBFDwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUAxQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFBgUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQYFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAEUGBQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQCFBwUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAGAAYABgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARABEAEQARAAAAAAAAAAAAAAAAAG8DdwN/A4cDnwOnA68DtwOPA5cDjwOXA48DlwOPA5cDjwOXA48DlwO9A8UDzQPVA90D5QPhA+kD8QP5A/QD/AOPA5cDjwOXAwQEDASPA5cDjwOXA48DlwMSBBoEIgQqBDIEOgRCBEoEUARYBGAEaARwBHgEfgSGBI4ElgSeBKYEsgSuBLoEwgQkBNIE2gTKBOIE5ATsBPQE/AT9BAUFDQUVBf0EHQUiBRUF/QQqBTIF/AQ6BUIF9ARHBY8DTwVTBVsFXQVlBW0F/AR1BX0F9AQGBIEFBQX0BI8DjwOJBY8DjwOPBZcFjwOPA5sFowWPA6cFrgWPA7YFvgXFBUYFjwOPA80F1QXdBeUFjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48D7QWPA/UFjwOPA48D/QWPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPAwUGjwOPA48DDQYNBgkFCQWPAxMGGwb1BTEGIwYjBjkGQAYpBo8DjwOPA0gGUAaPA48DjwNSBloGYgaPA2kGcQaPA3kGjwOPAzkFgQZHBYkGBgSRBo8DmAaPA50GjwOPA48DjwOjBqsGjwOPA48DjwOPA48D3QOzBo8DjwOPA48DjwOPA48DjwOPA48DjwOPA48DuwbDBscG3wblBs8G1wbtBvUG+QbIBQEHCQcRB48DGQdaBloGWgYpBzEHOQdBB0YHTgdWByEHXgdmB48DbAdzB1oGWgZaBloGcwV5B1oGgQePA48DVwZaBloGWgZaBloGWgZaBloGWgZaBloGWgZaBokHWgZaBloGWgZaBo8HWgZaBpcHnwePA48DjwOPA48DjwOPA48DWgZaBloGWgavB7cHvwenB88H1wffB+YH7Qf1B/kHxwdaBloGWgYBCAcIWgYNCBAIjwOPA48DjwOPA48DjwMYCI8DjwOPAyAIjwOPA48D3QMoCDAINQiPAz0IWgZaBl0GWgZaBloGWgZaBloGRAhKCFoIUgiPA48DYgj9BY8DtgOPA48DjwOPA48DjwNaBh8IxAOPAzkIagiPA3IIegiPA48DjwOPA34IjwOPA1IGtQOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DWgZaBo8DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwM5CFoGcwWPA48DjwOPA48DjwOPA48DjwOFCI8DjwOKCF0FjwOPA6kFWgZRBo8DjwOSCI8DjwOPA5oIoQgjBqkIjwOPA38FsQiPA7kIwAiPA+IExQiPA/sEjwPNCNUI/QSPA9kI/AThCI8DjwOPA48DjwOPA48D6AiPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48D/AjwCPQIjgSOBI4EjgSOBI4EjgSOBI4EjgSOBI4EjgSOBAQJjgSOBI4EjgQMCRAJGAkgCSQJLAmOBI4EjgQwCTgJfwNACUgJjwOPA48DUAmPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DPA48DnwOvA48DjwOPA48DjwOPA70DjQPdA+ED8QP0A88DjwOEBA8DjwOPA5IEIgQyBAIEUARgBHAEfgROBJ4EkAKgArACv8KoAGgAaABoAGgAaABoAGgAaABNwugAaABoAGgAaABoAGgAaABoAF0C6ABoAGpC+kLKQxpDKkM6QygAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgASkNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEpDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABKQ2gAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgASkNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEpDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABKQ2gAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgASkNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEpDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABKQ2gAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgASkNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEpDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABKQ1pDXkNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgASkNoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAEpDaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABoAGgAaABKQ2PA48DjwOPA48DjwOPA48DWAmPA1oGWgZgCf0FjwP1BI8DjwOPA48DjwOPA48DaAmPA48DjwNvCY8DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPAyQEJAQkBCQEJAQkBCQEJAR3CSQEJAQkBCQEJAQkBCQEfwmDCSQEJAQkBCQEkwmLCSQEmwkkBCQEowmpCSQEJAQkBCQEJAQkBCQEJAQkBCQEuQmxCSQEJAQkBCQEJAQkBCQEJAQkBMEJJAQkBCQEJAQkBMkJ0AnWCSQEJAQkBCQE/ATeCeUJ7AkGBO8JjwOPA+IE9gmPA/wJBgQBCgkKjwOPAw4KjwOPA48DjwMgCBYKBgSBBVwFHQqPA48DjwOPA48D3gklCo8DjwMtCjUKjwOPA48DjwOPA48DOQpBCo8DjwNJClwFUQqPA1cKjwOPA+0FXwqPA48DjwOPA48DjwNkCo8DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwNsCnAKeAqPA38KjwOPA48DjwOPA48DjwOPA48DjwOPA48DhgqPA48DlAqOCo8DjwOPA5wKpAqPA6gKjwOPA48DjwOPA48DjwOPA48DjwODBY8DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOuCo8DtAqPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA7oKjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DFgXCCo8DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwPJCtEK1wqPA48DWgZaBt8KjwOPA48DjwOPA1oGWgYzCI8DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA+EKjwPoCo8D5AqPA+sKjwPzCvcKjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwPdA/8K3QMGCw0LFQuPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwMdCyULjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPAyQEJAQkBCQEJAQkBC0LJAQ1CzULPAskBCQEJAQkBCQEJAQkBCQEJAQkBCQEJAQkBCQEJAQkBCQEJAQkBCQEJAQkBCQEJAT0CI4EjgQkBCQEJAQkBCQEJAQkBCQEJAQkBI4EjgSOBI4EjgSOBI4ERAskBCQEJAQkBCQEJAQkBCQEWgZMC1oGWgZdBlELVQtECF0LsQOPA2MLjwOPA48DjwOPA48DjwNqB48DjwOPA48DWgZaBloGWgZaBloGWgZaBloGWgZaBloGWgZaBloGWgZaBloGWgZaBloGWgZaBloGWgZaBloGWgZaBloGawtzC1oGWgZaBl0GWgZaBnsLjwNMC1oGgwtaBosLRgiPA48DTAuPC1oGlwtaBp8LpwtaBo8DjwOPA0YIjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOvC48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA48DjwOPA68Lvwu3C7cLtwvAC8ALwAvAC90D3QPdA90D3QPdA90DyAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC8ALwAvAC24DbgNuAxIAEgASABIAEgASABIAEgASAAgABwAIAAkABwASABIAEgASABIAEgASABIAEgASABIAEgASABIABwAHAAcACAAJAAoACgAEAAQABAAKAAoACjEK8goAAwAGAAMABgAGAAIAAgACAAIAAgACAAIAAgACAAIABgAKAApQCgAK0AoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAClEKAArSCgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAApRCgAK0goAEgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIAEgASABIAEgAHABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgAGAAoABAAEAAQABAAKAAoACgAKAAAACpAKALIACgAKAAQABAACAAIACgAAAAoACgAKAAIAAAAKkAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAACgAKAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAAAAAAKAAoAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAAAAAKAAoABAABALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAEAsQABALEAsQABALEAsQABALEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAUABQAFAAUABQAFAAoACgANAAQABAANAAYADQAKAAoAsQCxALEAsQCxALEAsQCxALEAsQCxAA0ArQgNAA0ADQBNAA0AjQCNAI0AjQBNAI0ATQCNAE0ATQBNAE0ATQCNAI0AjQCNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ALQBNAE0ATQBNAE0ATQBNAI0ATQBNALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAUABQAFAAUABQAFAAUABQAFAAUABAAFAAUADQBNAE0AsQCNAI0AjQANAI0AjQCNAE0ATQBNAE0ATQBNAE0ATQCNAI0AjQCNAI0AjQCNAI0AjQCNAI0AjQCNAI0AjQCNAI0AjQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0AjQBNAE0AjQCNAI0AjQCNAI0AjQCNAI0ATQCNAE0AjQBNAE0AjQCNAA0AjQCxALEAsQCxALEAsQCxAAUACgCxALEAsQCxALEAsQANAA0AsQCxAAoAsQCxALEAsQCNAI0AAgACAAIAAgACAAIAAgACAAIAAgBNAE0ATQANAA0ATQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQCtAI0AsQBNAE0ATQCNAI0AjQCNAI0ATQBNAE0ATQCNAE0ATQBNAE0ATQBNAE0ATQBNAI0ATQCNAE0AjQBNAE0AjQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAA0ADQCNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQCNAI0AjQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQCNAI0ATQBNAE0ATQCNAE0AjQCNAE0ATQBNAI0AjQBNAE0ATQBNAE0ATQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0AsQCxALEAsQCxALEAsQCxALEAsQCxAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAAEAAQABAAEAAQABAAEAAQABAAEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAsQCxALEAsQCxALEAsQCxALEAAQABAAoACgAKAAoAIQABAAEAsQABAAEAsQCxALEAsQABALEAsQCxAAEAsQCxALEAsQCxAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABALEAsQCxALEAAQCxALEAsQCxALEAgQBBAEEAQQBBAEEAgQCBAEEAgQBBAEEAQQBBAEEAQQBBAEEAQQBBAIEAQQABAAEAAQCxALEAsQABAAEAAQABAE0ADQBNAE0ATQBNAA0AjQBNAI0AjQANAA0ADQANAA0AAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQCxALEABQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEATQBNAE0ATQBNAE0ATQBNAE0ATQCNAI0AjQANAI0ATQBNAI0AjQBNAE0ADQBNAE0ATQCNAE0ATQBNAE0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0AsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAACxAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAsQAAAAAAAACxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAACxALEAsQCxAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQABAAAAAAAAAAAAAAAAAAAAAQAAAAAALEAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAACxALEAAAAAALEAsQCxAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQAAALEAsQAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAsQAAALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAEAAoAAAAAAAAAAAAAALEAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQAAAAAAAAAAAAAAsQCxALEAAACxALEAsQCxAAAAAAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAKAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAsQCxALEAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAALEAsQCxALEAsQCxALEAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAALEAsQCxALEAsQCxAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAsQAAALEACjEK8goxCvIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAAALEAsQCxALEAsQAAALEAsQAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAALEAsQCxALEAsQCxAAAAsQCxAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAACxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAACxALEAAAAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKMQryAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAAALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAALEAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAQAAACxAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQACxAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgBKAAoACgAqALEAsQCxABIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAAAAAAAAAAAAAAAAAAAAAALEAsQBAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAALEAsQCxAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAsQCxALEAAAAAAAAAAAAKAAAAAAAAAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAALEAsQCxALEAsQCxALEAAACxAAAAsQAAAAAAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAsQCxALEAsQCxAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAAAAAALEAsQAAALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAsQCxAAAAAAAAALEAAACxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQAAALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAACxALEAsQCxALEAsQCxAAAAAAAAAAAAsQAAAAAAAAAAAAAAAACxAAAAAAAAALEAsQAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAACxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoAAAAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAAAAoACgAKAAoABgAKMQryCgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACQCyALIAsgCyALIAEgAUCBUIEwgWCLIAsgCyALIAsgCyAAIAAAAAAAAAAgACAAIAAgACAAIAAwADAAoACjEK8gAACQAJAAkACQAJAAkACQAJAAkACQAJALIAEgQyBKAIoQgKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAkABwCrCK4IsAisCK8IBgAEAAQABAAEAAQACgAKAAoACgAKMArwCgAKAAoACgAKAAIAAgACAAIAAgACAAIAAgACAAIAAwADAAoACjEK8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAKAAoAAAAKAAoACgAKAAAACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAoACgAKAAAAAAAAAAAAAAAKAAoACgAKAAoACgAAAAoAAAAKAAAACgAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAAAAAAAAAAAAoQCgAKAAoACgAAAAAAAAAAAAAACgAKAAoACgAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AoACgAKMArwCpAKkAqQChAKkAqQChAKEAqQCpAKkAqQCpAKEAoAChAKEAoQChAKAAoACgAKcApwCnAKsAqwCrAKAAoACgAKEAMABAAKAAqQChAKAAoACgAKEAoQChAKEAoACpAKkAqQCpAKAAqQCgAKEAoACgAKAAoAChAKEAoQChAKEAoQChAKEAoQCgAKAAoACgAKAAoQCgAKEAowCvAKEAoQChAKEAoQCpAKEAqQChAKEAoQChAKEAoQCpAKAAoACgAKAAoACjAK8AowCvAKAAoACgAKAAoACgAKAAoACgAKEAoQCgAKEAoACjAK8AowCvAKMArwCjAK8AoACgAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKEAoACgAKMArwCjAK8AoACgAKAAoACgAKkAoACgAKAAoACgAKAAoACgAKAAowCvAKAAoACpAKEAqQCpAKEAqQChAKEAoQChAKMArwCjAK8AowCvAKMArwCpAKAAoACgAKAAoAChAKEAoACgAKAAoACgAKAAoACgAKAAowCvAKMArwCpAKAAoACjAK8AoACgAKAAoACjAK8AowCvAKMArwCjAK8AowCvAKAAoACgAKAAoACgAKAAoACjEK8goxCvIKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAChAKEAoACgAKAAoACgAKAAoACjEK8goACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKMQryCjEK8goxCvIKMQryCjEK8goxCvIKMQryCgAKAAoACgAKAAoACgAKAAoACgAKEAoACgAKMArwCjEK8goACjAK8AoAClAKEArQCgAKAAoACgAKAAoQChAKMArwCgAKAAoACgAKAAqQCjAK8AoACgAKAAowCvAKMArwCjEK8goxCvIKMQryCjEK8goxCvIKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAChAKAAoQChAKEAoACgAKMArwCgAKAAoACgAKAAoACgAKAAoACgAKEAqQChAKEAowCvAKAAoACjEK8goACgAKAAoACgAKMQryCjEK8goxCvIKMQryCjEK8gpxCjIK8QqyCjEK8goxCvIKMQryCjEK8goACgAKkAoQChAKEAoQCpAKAAoQCpAKMArwChAKEAowCvAKMArwCjAK8AowCvAKAAoACgAKAAoACgAKAAoACpAKAAoACgAKAAoACgAKAAowCvAKEAoQCjAK8AoACgAKAAoQCgAKAAoACgAKEAowCvAKMArwCgAKMArwCgAKAAoxCvIKMQryChAKAAoACgAKAAoAChAKkAqQCpAKEAoACgAKAAoACgAKMArwCpAKAAoACgAKAAoQCgAKAAoACjAK8AowCvAKEAoAChAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKEAoQChAKEAoQChAKEAoQChAKEAoQChAKEAoQChAKEAoQChAKEAoAChAKEAoQChAKAAoAChAKAAoQCgAKAAoQCgAKMArwCjAK8AoACgAKAAoACgAKMArwCgAKAAoACgAKAAoACjAK8AoQCgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAChAKEAoACgAKAAoACgAKAAoACjAK8AoACgAKAAoAChAKEAoQChAKAAoQChAKAAoAChAKEAoACgAKAAoACjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AoQCgAKAAowCvAKMArwCjAK8AowCvAKAAowCvAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AowCvAKMArwCjAK8AoACgAKAAoACgAKEAoACpAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAoACgAKAAoACgAKAAoACgAKAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAqQAAAAAAAAAAAAAAAACgAKAAoACgAKAAoAAAAAAAAAAACxALEAsQAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAoACgAKMArwCjAK8AoACgAKAAowCvAKAAowCvAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACjAK8AoACgAKMArwCjEK8goxCvIKMQryCjEK8goACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAAAAACgAAAAAAAAAAAAAACgAKAAAAAAAAAAAAAAAKAAoACgAJAAoACgAKAAoAAAAAAAAACjEK8goxCvIKMQryCjEK8goxCvIKAAoACjEK8goxCvIKMQryCjEK8goACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxAAoAsQCxALEAsQCxALEAsQCxALEAsQAKAAoAAAAAAAAAAAAAAAAAAAAAAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAALEAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQAAAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAAAAAAAAAAAAAAAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAGAAAAAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAACxALEAsQCxAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxAAAAAACxALEAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAALEAsQCxAAAAAACxALEAAAAAAAAAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAAAAAAAAAAAAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAACxAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQADAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQCxAAEADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ACgAKAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0AEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAAoADQANALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoABgAKAAYAAAAKAAYACgAKAAoACjEK8goxCvIKMQryBAAKAAoAAwADAAowCvAKAAAACgAEAAQACgAAAAAAAAAAAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0AsgAAAAoACgAEAAQABAAKAAoACjEK8goAAwAGAAMABgAGAAIAAgACAAIAAgACAAIAAgACAAIABgAKAApQCgAK0AoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAClEKAArSCgAKMQryCgAKMQryCgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAQACgAKAAoABAAEAAAACgAKAAoACgAKAAoACgAAABIAEgASABIAEgASABIAEgASAKoAqgCqAAoACgASABIAAAAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAACxAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAoAAQCxALEAsQABALEAsQABAAEAAQABAAEAsQCxALEAsQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQCxALEAsQABAAEAAQABALEAQQCBAAEAAQCBALEAsQABAAEAAQABAEEAQQBBAEEAgQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAEEAQQBBAEEAQQCBAAEAgQABAIEAgQABAAEAYQCBAIEAgQCBAIEAQQBBAEEAQQBhAEEAQQBBAEEAQQCBAEEAQQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAoACgAKAAoACgAKAAoAQQCBAEEAgQCBAIEAQQBBAEEAgQBBAEEAgQBBAIEAgQBBAIEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAgQCBAIEAgQBBAEEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAE0ATQCNAE0AsQCxALEAsQANAA0ADQANAA0ADQANAA0ABQAFAAUABQAFAAUABQAFAAUABQANAA0ADQANAA0ADQBtAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQAFAAUABQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEATQBNAE0AjQBNAE0ATQBNAE0ATQBNAE0ATQBNAE0ATQBNAA0AsQCxALEAsQCxALEAsQCxALEAsQCxAE0ATQBNAI0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAAAAAALEAsQAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxAAAAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxAAAAAACxAAAAsQCxAAAAAAAAAAAAAAAAALEAAAAAAAAAAACxALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAAAAAAAAAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQAAALEAAAAAAAAAAACxALEAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAAAAAAAAAAAAAAACxALEAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQAAAAAAsQAAALEACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAAACxAAAAAACxALEAsQCxALEAsQAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxAAAAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQAAALEAsQAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCgAKAAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxAAAAAACxALEAsQCxAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxAAAAAACxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQAAALEAsQCxALEAsQCxAAAAoACxALEAsQCxALEAsQCxALEAAAAAALEAsQCxALEAsQCxALEAAACxALEAAACxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQCxAAAAAAAAALEAAACxALEAAACxALEAsQCxALEAsQCxAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAAAAAAAAAsQAAALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALIAsgCyALIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACxALEAsQAAAAAAAAAAAAAAAAAAAAAAAACyALIAsgCyALIAsgCyALIAsQCxALEAsQCxALEAsQCxAAAAAACxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoAsQCxALEACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAChAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAChAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAAgACAAIAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAACxAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALEAsQCxALEAsQAAALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAsQCxALEAsQCxALEAsQAAALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQAAAAAAsQCxALEAsQCxALEAsQAAALEAsQAAALEAsQCxALEAsQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABALEAsQCxALEAsQCxALEAAQABAAEAAQABAAEAAQABAAEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBAEEAQQBBALEAsQCxALEAsQCxALEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEAAQABAAEADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQAKAAoADQANAA0ADQANAA0ADQANAA0ADQANAA0ADQANAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgACAAIAAgACAAIAAgACAAIAAgACAAIACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAAAAAACgAKAAoACgAAAAAAAAAKAAAACgAKAAoACgAKAAoACgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAoACgAKAAoACgAKAAoACgAKAAoAAAAAAAAAAAAAAAAACgAKAAoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAoACgAKAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABIAEgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAsgCyALIAEgCyABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASABIAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQCxALEAsQASABIAEgASABIAEgASABIAEgASABIAEgASABIAEgASAAAAAAAAAAAAAAECBwgDCQYFBAQKCgwKCgoLCgQEBAQNDgECBAUHDxEHCQcABwMSFQQBIiQlJy8xJyknAQEjMjUAIQIkJScvMScpJwICIzI1ASEiJiYoMDEoKCgDAwMyNQEhIgQlJy8xSgtKBAQjEhUCISIkBScvMScpTAUFIzI1AyEiBgYoMDEoKE0GBiMSFQMhIiQlBy8xB04HBwcjMjUEISImJggwMQgICAgIIzI1BCEiBCUHLzEHCQcJCSMSFQRhYgRlh29xh46HCodjEhUCISIEJScvMScLJwsLIxIVAmFiZAWHb3GHjocMh2NydQNhYgYGiHBxiIiIDYhjEhUDISKEJQcvMQcOBw4OI5KVBCEiJCUnDzEnKScPJyMyNQUhIiYmKBAxKCgoECgjMjUFISIkJScvEScpJxEnIzI1BiEiEiUnLzFTFFMSEiMSFQBhYhJlh29xh46HE4djEhUAISISJScvMScUJxQUIxIVACEiFSUnLzFWF1YVFSMSFQNhYhVlh29xh46HFodjEhUDISIVJScvMScXJxcXIxIVAwACEREAAAAAAEIBAQAAAAAAAgQEExMAAQAiNDQDAwAAAAIEBBMTAAIBAAICAAAAAAEAAQITEwABAQACAgAAAAEhMAYEAwMwACEwBgQFBTADITAGBAUFMAIhMAYEAwMwAQABAgMEAAENDgBiAQEAAAAAAGIBAQAwAAQAYlRUEzAAAzBCVFQDMDADMEIEBBMwMAQTAAEBAAAAACMAAQECQAABIwABAQJAAAADAAM2FEAAAVNABTYEQEAAU0AFNgRAQAFTQAYGBEBAAwABAgUGBwgAAQkKCwwAAQACAAAAAAABAwMUFAABAAEAAhUVAAIAAQMDFBQAAgAhMzMEBAAAACEAMgUFAAAAYwABAAAAAABjAAESMAAEIGMgAQIwIAMAY1VWFDAAAzBDVVYEMDADMEMFVhQwMAQwQ1UGFDAwBAABAAAAAAAAAAEAABQUAAEAAQAAFRUAAgABAAAUFAACIAEgIAQEIAEgASAgBQUgAQEAAQEAAAAAAQABARQUAAEBAAEBAAAAAQEAAQEFBQABIQAhIQQEAAABAAEBBQUAAAADEREAAAAAIAMBAQIgIAIgAwEBAiAgAQADBQUUAAABIAMFBQQgIAEAAwUFFAAAAgIAAQEAAAAAAgABAQAAAAECABQUEwAAASIABAQDAAAAIgAEBAMAAAEBAAICAAAAAAEAAQMUFAABAQACAgAAAAEBAAEDBQUAASEAIQMEBAAAAQABAwUFAAAAAAAAAAAAAAABAAMAAQABAAACAgAAAQIAAQECAAEBAwAAAAAAAAAAAAEAAwABAAMAAAECAAABAgABAQIAAQEDAAIEBggKDA4AAQAAAAAAAQIDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQIDAAAAAAAAAAAAAAAAAAEAAAABAgMAAQIDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAECAwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEBAQEBAMDAwADAAMDAwMDAwMDAwMAAAEAAQABAAEAAQIDAAEAAQIDAAEAAQIDAAECAwABAgMAAQIDAAECAwABAAEAAQABAAECAwABAgMAAQIDAAECAwABAgMAAQIDAAECAwABAgMAAQIDAAECAwABAgMAAQIDAAECAwABAgMAAQIDAAEAAQABAgMAAQABAAEAAQAAAE4xMF9fY3h4YWJpdjExNl9fc2hpbV90eXBlX2luZm9FAFN0OXR5cGVfaW5mbwBOMTBfX2N4eGFiaXYxMjBfX3NpX2NsYXNzX3R5cGVfaW5mb0UATjEwX19jeHhhYml2MTE3X19jbGFzc190eXBlX2luZm9FAE4xMF9fY3h4YWJpdjExOV9fcG9pbnRlcl90eXBlX2luZm9FAE4xMF9fY3h4YWJpdjExN19fcGJhc2VfdHlwZV9pbmZvRQ==';
var tempDoublePtr = STATICTOP;
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
function __ZSt18uncaught_exceptionv() {
    return !!__ZSt18uncaught_exceptionv.uncaught_exception;
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
function ___resumeException(ptr) {
    if (!EXCEPTIONS.last) {
        EXCEPTIONS.last = ptr;
    }
    throw ptr + ' - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch.';
}
function ___cxa_find_matching_catch() {
    var thrown = EXCEPTIONS.last;
    if (!thrown) {
        return (setTempRet0(0), 0) | 0;
    }
    var info = EXCEPTIONS.infos[thrown];
    var throwntype = info.type;
    if (!throwntype) {
        return (setTempRet0(0), thrown) | 0;
    }
    var typeArray = Array.prototype.slice.call(arguments);
    var pointer = Module['___cxa_is_pointer_type'](throwntype);
    if (!___cxa_find_matching_catch.buffer)
        ___cxa_find_matching_catch.buffer = _malloc(4);
    HEAP32[___cxa_find_matching_catch.buffer >> 2] = thrown;
    thrown = ___cxa_find_matching_catch.buffer;
    for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
            thrown = HEAP32[thrown >> 2];
            info.adjusted = thrown;
            return (setTempRet0(typeArray[i]), thrown) | 0;
        }
    }
    thrown = HEAP32[thrown >> 2];
    return (setTempRet0(throwntype), thrown) | 0;
}
function ___gxx_personality_v0() {
}
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
var ASSERTIONS = false;
function intArrayToString(array) {
    var ret = [];
    for (var i = 0; i < array.length; i++) {
        var chr = array[i];
        if (chr > 255) {
            if (ASSERTIONS) {
            }
            chr &= 255;
        }
        ret.push(String.fromCharCode(chr));
    }
    return ret.join('');
}
var decodeBase64 = typeof atob === 'function' ? atob : function (input) {
    var keyStr = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    var output = '';
    var chr1, chr2, chr3;
    var enc1, enc2, enc3, enc4;
    var i = 0;
    input = input.replace(/[^A-Za-z0-9\+\/\=]/g, '');
    do {
        enc1 = keyStr.indexOf(input.charAt(i++));
        enc2 = keyStr.indexOf(input.charAt(i++));
        enc3 = keyStr.indexOf(input.charAt(i++));
        enc4 = keyStr.indexOf(input.charAt(i++));
        chr1 = enc1 << 2 | enc2 >> 4;
        chr2 = (enc2 & 15) << 4 | enc3 >> 2;
        chr3 = (enc3 & 3) << 6 | enc4;
        output = output + String.fromCharCode(chr1);
        if (enc3 !== 64) {
            output = output + String.fromCharCode(chr2);
        }
        if (enc4 !== 64) {
            output = output + String.fromCharCode(chr3);
        }
    } while (i < input.length);
    return output;
};
function intArrayFromBase64(s) {
    if (typeof ENVIRONMENT_IS_NODE === 'boolean' && ENVIRONMENT_IS_NODE) {
        var buf;
        try {
            buf = Buffer.from(s, 'base64');
        } catch (_) {
            buf = new Buffer(s, 'base64');
        }
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    }
    try {
        var decoded = decodeBase64(s);
        var bytes = new Uint8Array(decoded.length);
        for (var i = 0; i < decoded.length; ++i) {
            bytes[i] = decoded.charCodeAt(i);
        }
        return bytes;
    } catch (_) {
        throw new Error('Converting base64 string to bytes failed.');
    }
}
function tryParseAsDataURI(filename) {
    if (!isDataURI(filename)) {
        return;
    }
    return intArrayFromBase64(filename.slice(dataURIPrefix.length));
}
function invoke_iii(index, a1, a2) {
    var sp = stackSave();
    try {
        return Module['dynCall_iii'](index, a1, a2);
    } catch (e) {
        stackRestore(sp);
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_iiii(index, a1, a2, a3) {
    var sp = stackSave();
    try {
        return Module['dynCall_iiii'](index, a1, a2, a3);
    } catch (e) {
        stackRestore(sp);
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_vi(index, a1) {
    var sp = stackSave();
    try {
        Module['dynCall_vi'](index, a1);
    } catch (e) {
        stackRestore(sp);
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_viiii(index, a1, a2, a3, a4) {
    var sp = stackSave();
    try {
        Module['dynCall_viiii'](index, a1, a2, a3, a4);
    } catch (e) {
        stackRestore(sp);
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_viiiii(index, a1, a2, a3, a4, a5) {
    var sp = stackSave();
    try {
        Module['dynCall_viiiii'](index, a1, a2, a3, a4, a5);
    } catch (e) {
        stackRestore(sp);
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
    var sp = stackSave();
    try {
        Module['dynCall_viiiiii'](index, a1, a2, a3, a4, a5, a6);
    } catch (e) {
        stackRestore(sp);
        if (typeof e !== 'number' && e !== 'longjmp')
            throw e;
        Module['setThrew'](1, 0);
    }
}
Module.asmGlobalArg = {
    'Math': Math,
    'Int8Array': Int8Array,
    'Int16Array': Int16Array,
    'Int32Array': Int32Array,
    'Uint8Array': Uint8Array,
    'Uint16Array': Uint16Array,
    'Uint32Array': Uint32Array,
    'Float32Array': Float32Array,
    'Float64Array': Float64Array,
    'NaN': NaN,
    'Infinity': Infinity,
    'byteLength': byteLength
};
Module.asmLibraryArg = {
    'abort': abort,
    'assert_em': assert_em,
    'enlargeMemory': enlargeMemory,
    'getTotalMemory': getTotalMemory,
    'abortOnCannotGrowMemory': abortOnCannotGrowMemory,
    'invoke_iii': invoke_iii,
    'invoke_iiii': invoke_iiii,
    'invoke_vi': invoke_vi,
    'invoke_viiii': invoke_viiii,
    'invoke_viiiii': invoke_viiiii,
    'invoke_viiiiii': invoke_viiiiii,
    '__ZSt18uncaught_exceptionv': __ZSt18uncaught_exceptionv,
    '___buildEnvironment': ___buildEnvironment,
    '___cxa_find_matching_catch': ___cxa_find_matching_catch,
    '___gxx_personality_v0': ___gxx_personality_v0,
    '___resumeException': ___resumeException,
    '___setErrNo': ___setErrNo,
    '_emscripten_memcpy_big': _emscripten_memcpy_big,
    'DYNAMICTOP_PTR': DYNAMICTOP_PTR,
    'tempDoublePtr': tempDoublePtr,
    'ABORT': ABORT,
    'STACKTOP': STACKTOP,
    'STACK_MAX': STACK_MAX
};
var asm = function (global, env, buffer) {
    'almost asm';
    var a = global.Int8Array;
    var b = new a(buffer);
    var c = global.Int16Array;
    var d = new c(buffer);
    var e = global.Int32Array;
    var f = new e(buffer);
    var g = global.Uint8Array;
    var h = new g(buffer);
    var i = global.Uint16Array;
    var j = new i(buffer);
    var k = global.Uint32Array;
    var l = new k(buffer);
    var m = global.Float32Array;
    var n = new m(buffer);
    var o = global.Float64Array;
    var p = new o(buffer);
    var q = global.byteLength;
    var r = env.DYNAMICTOP_PTR | 0;
    var s = env.tempDoublePtr | 0;
    var t = env.ABORT | 0;
    var u = env.STACKTOP | 0;
    var v = env.STACK_MAX | 0;
    var w = 0;
    var x = 0;
    var y = 0;
    var z = 0;
    var A = global.NaN, B = global.Infinity;
    var C = 0, D = 0, E = 0, F = 0, G = 0;
    var H = 0;
    var I = global.Math.floor;
    var J = global.Math.abs;
    var K = global.Math.sqrt;
    var L = global.Math.pow;
    var M = global.Math.cos;
    var N = global.Math.sin;
    var O = global.Math.tan;
    var P = global.Math.acos;
    var Q = global.Math.asin;
    var R = global.Math.atan;
    var S = global.Math.atan2;
    var T = global.Math.exp;
    var U = global.Math.log;
    var V = global.Math.ceil;
    var W = global.Math.imul;
    var X = global.Math.min;
    var Y = global.Math.max;
    var Z = global.Math.clz32;
    var _ = env.abort;
    var $ = env.assert_em;
    var aa = env.enlargeMemory;
    var ba = env.getTotalMemory;
    var ca = env.abortOnCannotGrowMemory;
    var da = env.invoke_iii;
    var ea = env.invoke_iiii;
    var fa = env.invoke_vi;
    var ga = env.invoke_viiii;
    var ha = env.invoke_viiiii;
    var ia = env.invoke_viiiiii;
    var ja = env.__ZSt18uncaught_exceptionv;
    var ka = env.___buildEnvironment;
    var la = env.___cxa_find_matching_catch;
    var ma = env.___gxx_personality_v0;
    var na = env.___resumeException;
    var oa = env.___setErrNo;
    var pa = env._emscripten_memcpy_big;
    var qa = 0;
    function ra(newBuffer) {
        if (q(newBuffer) & 16777215 || q(newBuffer) <= 16777215 || q(newBuffer) > 2147483648)
            return false;
        b = new a(newBuffer);
        d = new c(newBuffer);
        f = new e(newBuffer);
        h = new g(newBuffer);
        j = new i(newBuffer);
        l = new k(newBuffer);
        n = new m(newBuffer);
        p = new o(newBuffer);
        buffer = newBuffer;
        return true;
    }
    function ya(a) {
        a = a | 0;
        var b = 0;
        b = u;
        u = u + a | 0;
        u = u + 15 & -16;
        return b | 0;
    }
    function za() {
        return u | 0;
    }
    function Aa(a) {
        a = a | 0;
        u = a;
    }
    function Ba(a, b) {
        a = a | 0;
        b = b | 0;
        u = a;
        v = b;
    }
    function Ca(a, b) {
        a = a | 0;
        b = b | 0;
        if (!w) {
            w = a;
            x = b;
        }
    }
    function Da(a) {
        a = a | 0;
        H = a;
    }
    function Ea() {
        return H | 0;
    }
    function Fa(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, e = 0, g = 0, h = 0, i = 0;
        g = u;
        u = u + 16 | 0;
        h = g;
        f[h >> 2] = 0;
        e = Lb(a, b, 0, 0, h) | 0;
        i = e + 1 | 0;
        f[h >> 2] = 0;
        c = nc(i << 1) | 0;
        Lb(a, b, c, i, h) | 0;
        if ((f[h >> 2] | 0) > 0) {
            oc(c);
            c = 0;
        } else
            d[c + (e << 1) >> 1] = 0;
        u = g;
        return c | 0;
    }
    function Ga(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0;
        e = u;
        u = u + 16 | 0;
        d = e;
        c = f[17556] | 0;
        if (!c) {
            c = Ma() | 0;
            f[17556] = c;
        }
        f[d >> 2] = 0;
        Ta(c, a, b, -2, d);
        if ((f[d >> 2] | 0) > 0)
            c = 0;
        else
            c = rb(f[17556] | 0) | 0;
        u = e;
        return c | 0;
    }
    function Ha(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0;
        d = u;
        u = u + 16 | 0;
        c = d + 4 | 0;
        b = d;
        f[c >> 2] = 0;
        f[b >> 2] = 0;
        sb(f[17556] | 0, a, b, c);
        u = d;
        return ((f[c >> 2] | 0) > 0 ? 0 : f[b >> 2] | 0) | 0;
    }
    function Ia(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        return (Ib(f[17557] | 0, a, b, c) | 0) == 1 | 0;
    }
    function Ja(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0;
        e = u;
        u = u + 16 | 0;
        d = e;
        f[d >> 2] = 0;
        c = f[17557] | 0;
        if (!c) {
            c = Ma() | 0;
            f[17557] = c;
        }
        zb(f[17556] | 0, a, b, c, d);
        if ((f[d >> 2] | 0) > 0)
            c = 0;
        else {
            f[d >> 2] = 0;
            c = Db(c, d) | 0;
            c = (f[d >> 2] | 0) > 0 ? 0 : c;
        }
        u = e;
        return c | 0;
    }
    function Ka(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0;
        g = u;
        u = u + 16 | 0;
        h = g;
        f[h >> 2] = 0;
        e = nc((c << 1) + 2 | 0) | 0;
        a = ub(a + (b << 1) | 0, c, e, c, h) | 0;
        if ((f[h >> 2] | 0) > 0)
            e = 0;
        else
            d[e + (a << 1) >> 1] = 0;
        u = g;
        return e | 0;
    }
    function La(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, e = 0, g = 0, h = 0, i = 0;
        i = u;
        u = u + 16 | 0;
        h = i;
        f[h >> 2] = 0;
        e = f[17557] | 0;
        if (!e) {
            e = Ma() | 0;
            f[17557] = e;
        }
        zb(f[17556] | 0, a, b, e, h);
        if ((f[h >> 2] | 0) <= 0 ? (g = qb(e) | 0, b = g + 1 | 0, c = nc(b << 1) | 0, xb(f[17557] | 0, c, b, 10, h) | 0, (f[h >> 2] | 0) <= 0) : 0)
            d[c + (g << 1) >> 1] = 0;
        else
            c = 0;
        u = i;
        return c | 0;
    }
    function Ma() {
        var a = 0, b = 0;
        b = u;
        u = u + 16 | 0;
        a = b;
        f[a >> 2] = 0;
        a = Na(a) | 0;
        u = b;
        return a | 0;
    }
    function Na(a) {
        a = a | 0;
        var c = 0;
        if (!a) {
            c = 0;
            return c | 0;
        }
        if ((Oa(f[a >> 2] | 0) | 0) << 24 >> 24) {
            c = 0;
            return c | 0;
        }
        c = _b(360) | 0;
        if (!c) {
            f[a >> 2] = 7;
            c = 0;
            return c | 0;
        }
        Vc(c | 0, 0, 360) | 0;
        b[c + 68 >> 0] = 1;
        b[c + 69 >> 0] = 1;
        if ((Qa(f[a >> 2] | 0) | 0) << 24 >> 24)
            return c | 0;
        Ra(c);
        c = 0;
        return c | 0;
    }
    function Oa(a) {
        a = a | 0;
        return (a | 0) > 0 | 0;
    }
    function Pa(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0;
        g = f[a >> 2] | 0;
        if (!g)
            if (c << 24 >> 24 != 0 ? (g = _b(d) | 0, f[a >> 2] = g, (g | 0) != 0) : 0) {
                f[b >> 2] = d;
                a = 1;
            } else
                a = 0;
        else if ((f[b >> 2] | 0) < (d | 0))
            if (c << 24 >> 24 != 0 ? (e = $b(g, d) | 0, (e | 0) != 0) : 0) {
                f[a >> 2] = e;
                f[b >> 2] = d;
                a = 1;
            } else
                a = 0;
        else
            a = 1;
        return a | 0;
    }
    function Qa(a) {
        a = a | 0;
        return (a | 0) < 1 | 0;
    }
    function Ra(a) {
        a = a | 0;
        var b = 0;
        if (!a)
            return;
        f[a >> 2] = 0;
        b = f[a + 44 >> 2] | 0;
        if (b | 0)
            ac(b);
        b = f[a + 48 >> 2] | 0;
        if (b | 0)
            ac(b);
        b = f[a + 52 >> 2] | 0;
        if (b | 0)
            ac(b);
        b = f[a + 56 >> 2] | 0;
        if (b | 0)
            ac(b);
        b = f[a + 60 >> 2] | 0;
        if (b | 0)
            ac(b);
        b = f[a + 64 >> 2] | 0;
        if (b | 0)
            ac(b);
        b = f[a + 344 >> 2] | 0;
        if (b | 0)
            ac(b);
        ac(a);
        return;
    }
    function Sa(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0;
        d = 0;
        while (1) {
            if ((d | 0) >= (a | 0)) {
                e = 5;
                break;
            }
            if ((f[b + (d << 3) >> 2] | 0) > (c | 0))
                break;
            d = d + 1 | 0;
        }
        if ((e | 0) == 5)
            d = a + -1 | 0;
        return f[b + (d << 3) + 4 >> 2] & 255 | 0;
    }
    function Ta(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, u = 0, v = 0, w = 0, x = 0, y = 0, z = 0;
        if (!g)
            return;
        if ((Oa(f[g >> 2] | 0) | 0) << 24 >> 24)
            return;
        if ((a | 0) == 0 | (c | 0) == 0 | (d | 0) < -1 | e + -126 << 24 >> 24 << 24 >> 24 > -1) {
            f[g >> 2] = 1;
            return;
        }
        if ((d | 0) == -1)
            d = bc(c) | 0;
        u = a + 84 | 0;
        if ((f[u >> 2] | 0) == 3) {
            Ua(a, c, d, e, g);
            return;
        }
        f[a >> 2] = 0;
        f[a + 4 >> 2] = c;
        z = a + 16 | 0;
        f[z >> 2] = d;
        f[a + 8 >> 2] = d;
        l = a + 12 | 0;
        f[l >> 2] = d;
        s = a + 93 | 0;
        b[s >> 0] = e;
        i = e & 1;
        j = i & 255;
        m = a + 116 | 0;
        f[m >> 2] = j;
        x = a + 132 | 0;
        f[x >> 2] = 1;
        k = a + 72 | 0;
        f[k >> 2] = 0;
        n = a + 76 | 0;
        f[n >> 2] = 0;
        f[a + 224 >> 2] = 0;
        y = a + 332 | 0;
        f[y >> 2] = 0;
        f[a + 336 >> 2] = 0;
        c = (e & 255) > 253;
        t = a + 94 | 0;
        b[t >> 0] = c & 1;
        if (!d) {
            if (c) {
                b[s >> 0] = i;
                b[t >> 0] = 0;
            }
            f[a + 120 >> 2] = f[96 + (j << 2) >> 2];
            f[a + 220 >> 2] = 0;
            f[x >> 2] = 0;
            Va(a);
            return;
        }
        f[a + 220 >> 2] = -1;
        c = f[a + 56 >> 2] | 0;
        w = a + 136 | 0;
        f[w >> 2] = (c | 0) == 0 ? a + 140 | 0 : c;
        c = a + 44 | 0;
        i = a + 68 | 0;
        if (!((Pa(c, a + 20 | 0, b[i >> 0] | 0, d) | 0) << 24 >> 24)) {
            f[g >> 2] = 7;
            return;
        }
        f[k >> 2] = f[c >> 2];
        if (!((Wa(a) | 0) << 24 >> 24)) {
            f[g >> 2] = 7;
            return;
        }
        v = f[k >> 2] | 0;
        q = f[l >> 2] | 0;
        k = a + 128 | 0;
        f[k >> 2] = q;
        d = a + 48 | 0;
        if (!((Pa(d, a + 24 | 0, b[i >> 0] | 0, q) | 0) << 24 >> 24)) {
            f[g >> 2] = 7;
            return;
        }
        f[n >> 2] = f[d >> 2];
        j = Xa(a, g) | 0;
        if ((Oa(f[g >> 2] | 0) | 0) << 24 >> 24)
            return;
        e = a + 240 | 0;
        d = f[e >> 2] | 0;
        do
            if ((d | 0) < 6)
                f[a + 244 >> 2] = a + 248;
            else {
                d = d << 4;
                c = a + 40 | 0;
                i = a + 64 | 0;
                if ((d | 0) <= (f[c >> 2] | 0)) {
                    f[a + 244 >> 2] = f[i >> 2];
                    break;
                }
                if ((Pa(i, c, 1, d) | 0) << 24 >> 24) {
                    f[a + 244 >> 2] = f[i >> 2];
                    break;
                }
                f[g >> 2] = 7;
                return;
            }
        while (0);
        f[e >> 2] = -1;
        f[m >> 2] = j;
        a:
            do
                switch (j | 0) {
                case 0: {
                        f[k >> 2] = 0;
                        break;
                    }
                case 1: {
                        f[k >> 2] = 0;
                        break;
                    }
                default: {
                        b:
                            do
                                switch (f[u >> 2] | 0) {
                                case 0: {
                                        f[a + 112 >> 2] = 104;
                                        break;
                                    }
                                case 1: {
                                        f[a + 112 >> 2] = 120;
                                        break;
                                    }
                                case 2: {
                                        f[a + 112 >> 2] = 136;
                                        break;
                                    }
                                case 4: {
                                        f[a + 112 >> 2] = 152;
                                        break;
                                    }
                                case 5: {
                                        d = a + 112 | 0;
                                        if (!(f[a + 88 >> 2] & 1)) {
                                            f[d >> 2] = 184;
                                            break b;
                                        } else {
                                            f[d >> 2] = 168;
                                            break b;
                                        }
                                    }
                                case 6: {
                                        d = a + 112 | 0;
                                        if (!(f[a + 88 >> 2] & 1)) {
                                            f[d >> 2] = 216;
                                            break b;
                                        } else {
                                            f[d >> 2] = 200;
                                            break b;
                                        }
                                    }
                                default: {
                                    }
                                }
                            while (0);
                        j = f[x >> 2] | 0;
                        if ((j | 0) < 2 ? (f[a + 120 >> 2] | 0) >= 0 : 0) {
                            do
                                if (b[t >> 0] | 0) {
                                    c = f[w >> 2] | 0;
                                    i = f[c >> 2] | 0;
                                    if ((i | 0) > 0)
                                        d = b[s >> 0] | 0;
                                    else
                                        d = Sa(j, c, 0) | 0;
                                    d = d & 1;
                                    if ((q | 0) > (i | 0)) {
                                        c = Sa(j, c, q + -1 | 0) | 0;
                                        break;
                                    } else {
                                        c = b[s >> 0] | 0;
                                        break;
                                    }
                                } else {
                                    d = b[s >> 0] | 0;
                                    c = d;
                                    d = d & 1;
                                }
                            while (0);
                            Ya(a, 0, q, d, c & 1);
                        } else {
                            o = f[n >> 2] | 0;
                            if ((b[t >> 0] | 0) != 0 ? (p = f[w >> 2] | 0, (f[p >> 2] | 0) <= 0) : 0)
                                d = Sa(j, p, 0) | 0;
                            else
                                d = b[s >> 0] | 0;
                            p = b[o >> 0] | 0;
                            n = q + -1 | 0;
                            l = p;
                            m = 0;
                            d = ((d & 255) < (p & 255) ? p : d) & 1;
                            while (1) {
                                if ((m | 0) > 0 ? (b[v + (m + -1) >> 0] | 0) == 7 : 0) {
                                    do
                                        if (!(b[t >> 0] | 0))
                                            r = 61;
                                        else {
                                            d = f[w >> 2] | 0;
                                            if ((m | 0) < (f[d >> 2] | 0)) {
                                                r = 61;
                                                break;
                                            }
                                            d = Sa(f[x >> 2] | 0, d, m) | 0;
                                        }
                                    while (0);
                                    if ((r | 0) == 61) {
                                        r = 0;
                                        d = b[s >> 0] | 0;
                                    }
                                    d = d & 1;
                                }
                                e = m;
                                while (1) {
                                    k = e + 1 | 0;
                                    if ((k | 0) >= (q | 0)) {
                                        r = 69;
                                        break;
                                    }
                                    c = b[o + k >> 0] | 0;
                                    if (c << 24 >> 24 != l << 24 >> 24 ? (1 << h[v + k >> 0] & 382976 | 0) == 0 : 0) {
                                        j = 1;
                                        break;
                                    }
                                    e = k;
                                }
                                c:
                                    do
                                        if ((r | 0) == 69) {
                                            r = 0;
                                            do
                                                if (b[t >> 0] | 0) {
                                                    c = f[w >> 2] | 0;
                                                    if ((q | 0) <= (f[c >> 2] | 0))
                                                        break;
                                                    c = Sa(f[x >> 2] | 0, c, n) | 0;
                                                    j = 0;
                                                    break c;
                                                }
                                            while (0);
                                            c = b[s >> 0] | 0;
                                            j = 0;
                                        }
                                    while (0);
                                p = l & 255;
                                i = c & 255;
                                i = ((p & 127) >>> 0 < (i & 127) >>> 0 ? i : p) & 1;
                                if (!(p & 128))
                                    Ya(a, m, k, d, i);
                                else {
                                    d = m;
                                    while (1) {
                                        p = o + d | 0;
                                        b[p >> 0] = b[p >> 0] & 127;
                                        if ((d | 0) < (e | 0))
                                            d = d + 1 | 0;
                                        else
                                            break;
                                    }
                                }
                                if (j) {
                                    l = c;
                                    m = k;
                                    d = i;
                                } else
                                    break;
                            }
                        }
                        d = f[a + 340 >> 2] | 0;
                        if (!((Oa(d) | 0) << 24 >> 24)) {
                            Za(a);
                            break a;
                        }
                        f[g >> 2] = d;
                        return;
                    }
                }
            while (0);
        k = a + 88 | 0;
        d:
            do
                if ((b[t >> 0] | 0 ? f[k >> 2] & 1 | 0 : 0) ? ((f[u >> 2] | 0) + -5 | 0) >>> 0 < 2 : 0) {
                    e = 0;
                    while (1) {
                        if ((e | 0) >= (f[x >> 2] | 0))
                            break d;
                        c = f[w >> 2] | 0;
                        d = (f[c + (e << 3) >> 2] | 0) + -1 | 0;
                        e:
                            do
                                if (f[c + (e << 3) + 4 >> 2] & 255 | 0) {
                                    if (!e)
                                        i = 0;
                                    else
                                        i = f[c + (e + -1 << 3) >> 2] | 0;
                                    c = d;
                                    while (1) {
                                        if ((c | 0) < (i | 0))
                                            break e;
                                        j = b[v + c >> 0] | 0;
                                        if (!(j << 24 >> 24))
                                            break;
                                        if (1 << (j & 255) & 8194 | 0)
                                            break e;
                                        c = c + -1 | 0;
                                    }
                                    if ((c | 0) < (d | 0))
                                        while (1)
                                            if ((b[v + d >> 0] | 0) == 7)
                                                d = d + -1 | 0;
                                            else
                                                break;
                                    _a(a, d, 4);
                                }
                            while (0);
                        e = e + 1 | 0;
                    }
                }
            while (0);
        if (!(f[k >> 2] & 2))
            d = (f[z >> 2] | 0) + (f[y >> 2] | 0) | 0;
        else
            d = (f[z >> 2] | 0) - (f[a + 348 >> 2] | 0) | 0;
        f[z >> 2] = d;
        Va(a);
        return;
    }
    function Ua(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, u = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0, B = 0, C = 0, D = 0, E = 0;
        C = a + 84 | 0;
        f[C >> 2] = 0;
        if (!d) {
            Ta(a, c, 0, e, g);
            D = 0;
            ac(D);
            f[C >> 2] = 3;
            return;
        }
        D = _b(d * 7 | 0) | 0;
        if (!D) {
            f[g >> 2] = 7;
            D = 0;
            ac(D);
            f[C >> 2] = 3;
            return;
        }
        j = D + (d << 2) | 0;
        B = j + (d << 1) | 0;
        k = a + 88 | 0;
        l = f[k >> 2] | 0;
        if (l & 1 | 0)
            f[k >> 2] = l & -4 | 2;
        e = e & 1;
        Ta(a, c, d, e, g);
        if ((Oa(f[g >> 2] | 0) | 0) << 24 >> 24) {
            ac(D);
            f[C >> 2] = 3;
            return;
        }
        x = Cb(a, g) | 0;
        v = a + 12 | 0;
        w = f[v >> 2] | 0;
        Uc(B | 0, x | 0, w | 0) | 0;
        x = a + 128 | 0;
        y = f[x >> 2] | 0;
        z = a + 116 | 0;
        A = f[z >> 2] | 0;
        i = xb(a, j, d, 2, g) | 0;
        Jb(a, D, g);
        if (!((Oa(f[g >> 2] | 0) | 0) << 24 >> 24)) {
            f[k >> 2] = l;
            f[C >> 2] = 5;
            u = a + 68 | 0;
            t = b[u >> 0] | 0;
            b[u >> 0] = 0;
            Ta(a, j, i, e ^ 1, g);
            b[u >> 0] = t;
            Eb(a, g);
            a:
                do
                    if (!((Oa(f[g >> 2] | 0) | 0) << 24 >> 24)) {
                        n = a + 220 | 0;
                        q = f[n >> 2] | 0;
                        o = a + 224 | 0;
                        p = f[o >> 2] | 0;
                        j = 0;
                        e = 0;
                        g = 0;
                        while (1) {
                            if ((g | 0) >= (q | 0))
                                break;
                            m = f[p + (g * 12 | 0) + 4 >> 2] | 0;
                            e = m - e | 0;
                            b:
                                do
                                    if ((e | 0) < 2)
                                        e = j;
                                    else {
                                        i = f[p + (g * 12 | 0) >> 2] & 2147483647;
                                        l = i + e | 0;
                                        e = j;
                                        while (1) {
                                            do {
                                                j = i;
                                                i = i + 1 | 0;
                                                if ((i | 0) >= (l | 0))
                                                    break b;
                                                k = f[D + (i << 2) >> 2] | 0;
                                                j = f[D + (j << 2) >> 2] | 0;
                                                u = k - j | 0;
                                                if ((((u | 0) > -1 ? u : 0 - u | 0) | 0) != 1)
                                                    break;
                                            } while ((b[B + k >> 0] | 0) == (b[B + j >> 0] | 0));
                                            e = e + 1 | 0;
                                        }
                                    }
                                while (0);
                            j = e;
                            e = m;
                            g = g + 1 | 0;
                        }
                        if (!j)
                            t = p;
                        else {
                            e = a + 60 | 0;
                            if (!((Pa(e, a + 36 | 0, b[a + 69 >> 0] | 0, (j + q | 0) * 12 | 0) | 0) << 24 >> 24))
                                break;
                            if ((q | 0) == 1) {
                                u = f[e >> 2] | 0;
                                f[u >> 2] = f[p >> 2];
                                f[u + 4 >> 2] = f[p + 4 >> 2];
                                f[u + 8 >> 2] = f[p + 8 >> 2];
                            }
                            t = f[e >> 2] | 0;
                            f[o >> 2] = t;
                            f[n >> 2] = (f[n >> 2] | 0) + j;
                        }
                        u = t + 4 | 0;
                        e = q;
                        i = j;
                        while (1) {
                            s = e + -1 | 0;
                            if ((e | 0) <= 0)
                                break a;
                            if (!s)
                                e = f[u >> 2] | 0;
                            else
                                e = (f[t + (s * 12 | 0) + 4 >> 2] | 0) - (f[t + ((e + -2 | 0) * 12 | 0) + 4 >> 2] | 0) | 0;
                            q = t + (s * 12 | 0) | 0;
                            j = f[q >> 2] | 0;
                            r = j >>> 31;
                            j = j & 2147483647;
                            if ((e | 0) < 2) {
                                if (!i)
                                    e = s;
                                else {
                                    e = s + i | 0;
                                    p = t + (e * 12 | 0) | 0;
                                    f[p >> 2] = f[q >> 2];
                                    f[p + 4 >> 2] = f[q + 4 >> 2];
                                    f[p + 8 >> 2] = f[q + 8 >> 2];
                                }
                                j = f[D + (j << 2) >> 2] | 0;
                            } else {
                                l = (r | 0) == 0;
                                g = e + -1 + j | 0;
                                p = l ? j : g;
                                m = l ? -1 : 1;
                                n = t + (s * 12 | 0) + 4 | 0;
                                o = t + (s * 12 | 0) + 8 | 0;
                                g = l ? g : j;
                                c:
                                    while (1) {
                                        e = g;
                                        while (1) {
                                            if ((e | 0) == (p | 0))
                                                break c;
                                            j = f[D + (e << 2) >> 2] | 0;
                                            k = e + m | 0;
                                            l = f[D + (k << 2) >> 2] | 0;
                                            E = j - l | 0;
                                            if ((((E | 0) > -1 ? E : 0 - E | 0) | 0) != 1)
                                                break;
                                            if ((b[B + j >> 0] | 0) == (b[B + l >> 0] | 0))
                                                e = k;
                                            else
                                                break;
                                        }
                                        E = f[D + (g << 2) >> 2] | 0;
                                        E = (E | 0) < (j | 0) ? E : j;
                                        l = i + s | 0;
                                        f[t + (l * 12 | 0) >> 2] = (r ^ h[B + E >> 0]) << 31 | E;
                                        f[t + (l * 12 | 0) + 4 >> 2] = f[n >> 2];
                                        E = e - g | 0;
                                        f[n >> 2] = (f[n >> 2] | 0) + ~((E | 0) > -1 ? E : 0 - E | 0);
                                        E = f[o >> 2] & 10;
                                        f[t + (l * 12 | 0) + 8 >> 2] = E;
                                        f[o >> 2] = f[o >> 2] & ~E;
                                        g = k;
                                        i = i + -1 | 0;
                                    }
                                if (!i)
                                    e = s;
                                else {
                                    e = i + s | 0;
                                    E = t + (e * 12 | 0) | 0;
                                    f[E >> 2] = f[q >> 2];
                                    f[E + 4 >> 2] = f[q + 4 >> 2];
                                    f[E + 8 >> 2] = f[q + 8 >> 2];
                                }
                                E = f[D + (g << 2) >> 2] | 0;
                                j = f[D + (p << 2) >> 2] | 0;
                                j = (E | 0) < (j | 0) ? E : j;
                            }
                            f[t + (e * 12 | 0) >> 2] = (r ^ h[B + j >> 0]) << 31 | j;
                            e = s;
                        }
                    }
                while (0);
            E = a + 93 | 0;
            b[E >> 0] = b[E >> 0] ^ 1;
        }
        f[a + 4 >> 2] = c;
        f[v >> 2] = w;
        f[a + 8 >> 2] = d;
        f[z >> 2] = A;
        E = f[a + 24 >> 2] | 0;
        Uc(f[a + 76 >> 2] | 0, B | 0, ((w | 0) > (E | 0) ? E : w) | 0) | 0;
        f[x >> 2] = y;
        if ((f[a + 220 >> 2] | 0) <= 1) {
            E = D;
            ac(E);
            f[C >> 2] = 3;
            return;
        }
        f[z >> 2] = 2;
        E = D;
        ac(E);
        f[C >> 2] = 3;
        return;
    }
    function Va(a) {
        a = a | 0;
        f[a + 100 >> 2] = 0;
        f[a + 108 >> 2] = 0;
        f[a >> 2] = a;
        return;
    }
    function Wa(a) {
        a = a | 0;
        var c = 0, e = 0, g = 0, i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0, B = 0, C = 0, D = 0, E = 0, F = 0, G = 0, H = 0, I = 0, J = 0, K = 0, L = 0, M = 0, N = 0;
        N = u;
        u = u + 1008 | 0;
        y = N + 504 | 0;
        G = N;
        C = f[a + 4 >> 2] | 0;
        E = f[a + 44 >> 2] | 0;
        J = f[a + 8 >> 2] | 0;
        K = a + 93 | 0;
        c = b[K >> 0] | 0;
        H = (c & 255) > 253;
        if (H)
            D = ((f[a + 84 >> 2] | 0) + -5 | 0) >>> 0 < 2;
        else
            D = 0;
        I = a + 88 | 0;
        M = f[I >> 2] | 0;
        i = M & 2;
        if (M & 4 | 0)
            f[a + 12 >> 2] = 0;
        c = c & 255;
        w = c & 1;
        x = w & 255;
        M = a + 136 | 0;
        e = (f[M >> 2] | 0) + 4 | 0;
        if (H) {
            f[e >> 2] = w;
            if ((f[a + 100 >> 2] | 0) > 0 ? (g = ob(a) | 0, g << 24 >> 24 != 10) : 0) {
                f[(f[M >> 2] | 0) + 4 >> 2] = g << 24 >> 24 != 0 & 1;
                g = x;
                k = 0;
            } else {
                g = x;
                k = 1;
            }
        } else {
            f[e >> 2] = c;
            g = 10;
            k = 0;
        }
        v = (i | 0) == 0;
        z = a + 132 | 0;
        A = a + 12 | 0;
        B = a + 348 | 0;
        e = -1;
        i = 0;
        l = 0;
        F = -1;
        c = 0;
        a:
            while (1) {
                b:
                    while (1) {
                        t = D & g << 24 >> 24 == 1;
                        g = l;
                        c:
                            while (1) {
                                d:
                                    while (1) {
                                        s = (e | 0) < 126;
                                        r = (k | 0) == 2 & s;
                                        q = (e | 0) > -1;
                                        e:
                                            while (1) {
                                                p = g;
                                                f:
                                                    while (1) {
                                                        if ((i | 0) >= (J | 0))
                                                            break a;
                                                        g = i + 1 | 0;
                                                        l = j[C + (i << 1) >> 1] | 0;
                                                        if (!((g | 0) == (J | 0) | (l & 64512 | 0) != 55296)) {
                                                            m = j[C + (g << 1) >> 1] | 0;
                                                            o = (m & 64512 | 0) == 56320;
                                                            i = o ? i + 2 | 0 : g;
                                                            if (o)
                                                                l = (l << 10) + -56613888 + m | 0;
                                                        } else
                                                            i = g;
                                                        o = cb(a, l) | 0;
                                                        g = o & 255;
                                                        o = o & 255;
                                                        c = 1 << o | c;
                                                        n = i + -1 | 0;
                                                        m = E + n | 0;
                                                        b[m >> 0] = g;
                                                        if ((l | 0) > 65535) {
                                                            b[E + (i + -2) >> 0] = 18;
                                                            c = c | 262144;
                                                        }
                                                        if (!v)
                                                            p = p + (((l + -8294 | 0) >>> 0 < 4 | ((l & -4 | 0) == 8204 | (l + -8234 | 0) >>> 0 < 5)) & 1) | 0;
                                                        switch (g << 24 >> 24) {
                                                        case 13:
                                                        case 1:
                                                            break b;
                                                        case 0: {
                                                                L = 25;
                                                                break c;
                                                            }
                                                        default: {
                                                            }
                                                        }
                                                        if ((o + -19 | 0) >>> 0 < 3) {
                                                            L = 35;
                                                            break e;
                                                        }
                                                        switch (g << 24 >> 24) {
                                                        case 22:
                                                            break f;
                                                        case 7: {
                                                                g = (i | 0) < (J | 0);
                                                                if (!((l | 0) == 13 & g))
                                                                    break d;
                                                                if ((d[C + (i << 1) >> 1] | 0) != 10) {
                                                                    g = 1;
                                                                    break d;
                                                                }
                                                                break;
                                                            }
                                                        default: {
                                                            }
                                                        }
                                                    }
                                                c = r ? c | 1048576 : c;
                                                if (q) {
                                                    L = 43;
                                                    break;
                                                } else
                                                    g = p;
                                            }
                                        if ((L | 0) == 35) {
                                            L = 0;
                                            g = e + 1 | 0;
                                            if ((e | 0) < 125) {
                                                f[y + (g << 2) >> 2] = n;
                                                f[G + (g << 2) >> 2] = k;
                                            }
                                            if ((o | 0) == 19) {
                                                b[m >> 0] = 20;
                                                e = g;
                                                k = 2;
                                            } else {
                                                e = g;
                                                k = 3;
                                            }
                                        } else if ((L | 0) == 43) {
                                            L = 0;
                                            if (s)
                                                k = f[G + (e << 2) >> 2] | 0;
                                            e = e + -1 | 0;
                                        }
                                        g = p;
                                    }
                                f[(f[M >> 2] | 0) + ((f[z >> 2] | 0) + -1 << 3) >> 2] = i;
                                if (t)
                                    f[(f[M >> 2] | 0) + ((f[z >> 2] | 0) + -1 << 3) + 4 >> 2] = 1;
                                if (f[I >> 2] & 4 | 0) {
                                    f[A >> 2] = i;
                                    f[B >> 2] = p;
                                }
                                if (g) {
                                    f[z >> 2] = (f[z >> 2] | 0) + 1;
                                    if (!((pb(a) | 0) << 24 >> 24)) {
                                        c = 0;
                                        L = 76;
                                        break a;
                                    }
                                    if (H) {
                                        L = 56;
                                        break;
                                    }
                                    f[(f[M >> 2] | 0) + ((f[z >> 2] | 0) + -1 << 3) + 4 >> 2] = h[K >> 0];
                                    e = -1;
                                    k = 0;
                                }
                                g = p;
                            }
                        g:
                            do
                                if ((L | 0) == 25) {
                                    L = 0;
                                    switch (k | 0) {
                                    case 1: {
                                            f[(f[M >> 2] | 0) + ((f[z >> 2] | 0) + -1 << 3) + 4 >> 2] = 0;
                                            g = 0;
                                            k = 0;
                                            break g;
                                        }
                                    case 2: {
                                            c = s ? c | 1048576 : c;
                                            g = 0;
                                            k = 3;
                                            break g;
                                        }
                                    default: {
                                            g = 0;
                                            break g;
                                        }
                                    }
                                } else if ((L | 0) == 56) {
                                    L = 0;
                                    f[(f[M >> 2] | 0) + ((f[z >> 2] | 0) + -1 << 3) + 4 >> 2] = w;
                                    e = -1;
                                    g = x;
                                    k = 1;
                                }
                            while (0);
                        l = p;
                    }
                switch (k | 0) {
                case 1: {
                        f[(f[M >> 2] | 0) + ((f[z >> 2] | 0) + -1 << 3) + 4 >> 2] = 1;
                        k = 0;
                        break;
                    }
                case 2: {
                        if (s) {
                            b[E + (f[y + (e << 2) >> 2] | 0) >> 0] = 21;
                            k = 3;
                            c = c | 2097152;
                        } else
                            k = 3;
                        break;
                    }
                default: {
                    }
                }
                l = p;
                F = (o | 0) == 13 ? n : F;
                g = 1;
            }
        if ((L | 0) == 76) {
            u = N;
            return c | 0;
        }
        E = (e | 0) > 125;
        g = E ? 2 : k;
        e = E ? 125 : e;
        while (1) {
            if ((e | 0) <= -1)
                break;
            if ((g | 0) == 2) {
                L = 62;
                break;
            }
            g = f[G + (e << 2) >> 2] | 0;
            e = e + -1 | 0;
        }
        if ((L | 0) == 62)
            c = c | 1048576;
        if (f[I >> 2] & 4) {
            if ((f[A >> 2] | 0) < (J | 0))
                f[z >> 2] = (f[z >> 2] | 0) + -1;
        } else {
            f[(f[M >> 2] | 0) + ((f[z >> 2] | 0) + -1 << 3) >> 2] = J;
            f[B >> 2] = p;
        }
        if (t)
            f[(f[M >> 2] | 0) + ((f[z >> 2] | 0) + -1 << 3) + 4 >> 2] = 1;
        if (H)
            b[K >> 0] = f[(f[M >> 2] | 0) + 4 >> 2];
        g = f[z >> 2] | 0;
        e = 0;
        while (1) {
            if ((e | 0) >= (g | 0))
                break;
            L = f[96 + ((f[(f[M >> 2] | 0) + (e << 3) + 4 >> 2] & 1) << 2) >> 2] | c;
            e = e + 1 | 0;
            c = L;
        }
        f[a + 120 >> 2] = c | (c & 128 | 0) != 0 & (b[a + 92 >> 0] | 0) != 0 & 1;
        f[a + 124 >> 2] = F;
        a = 1;
        u = N;
        return a | 0;
    }
    function Xa(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0, B = 0, C = 0, D = 0, E = 0, F = 0, G = 0, H = 0, I = 0, J = 0, K = 0, L = 0;
        L = u;
        u = u + 5328 | 0;
        o = L + 2532 | 0;
        C = L + 5064 | 0;
        D = L;
        I = f[a + 72 >> 2] | 0;
        K = f[a + 76 >> 2] | 0;
        G = f[a + 4 >> 2] | 0;
        H = f[a + 12 >> 2] | 0;
        E = a + 120 | 0;
        g = f[E >> 2] | 0;
        z = a + 94 | 0;
        if ((b[z >> 0] | 0) != 0 ? (e = f[a + 136 >> 2] | 0, (f[e >> 2] | 0) <= 0) : 0)
            i = Sa(f[a + 132 >> 2] | 0, e, 0) | 0;
        else
            i = b[a + 93 >> 0] | 0;
        y = a + 240 | 0;
        f[y >> 2] = 0;
        if ((Oa(f[c >> 2] | 0) | 0) << 24 >> 24) {
            K = 0;
            u = L;
            return K | 0;
        }
        e = eb(g) | 0;
        if ((e | 0) != 2) {
            K = e;
            u = L;
            return K | 0;
        }
        if ((f[a + 84 >> 2] | 0) > 1) {
            m = a + 132 | 0;
            k = a + 136 | 0;
            i = 0;
            while (1) {
                if ((i | 0) >= (f[m >> 2] | 0)) {
                    F = 2;
                    break;
                }
                if (!i) {
                    e = 0;
                    g = f[k >> 2] | 0;
                } else {
                    g = f[k >> 2] | 0;
                    e = f[g + (i + -1 << 3) >> 2] | 0;
                }
                l = f[g + (i << 3) >> 2] | 0;
                g = f[g + (i << 3) + 4 >> 2] & 255;
                while (1) {
                    if ((e | 0) >= (l | 0))
                        break;
                    b[K + e >> 0] = g;
                    e = e + 1 | 0;
                }
                i = i + 1 | 0;
            }
            u = L;
            return F | 0;
        }
        if (!(g & 7985152)) {
            fb(a, o);
            n = a + 132 | 0;
            l = a + 136 | 0;
            k = 0;
            a:
                while (1) {
                    if ((k | 0) >= (f[n >> 2] | 0)) {
                        F = 2;
                        J = 89;
                        break;
                    }
                    if (!k) {
                        g = 0;
                        e = f[l >> 2] | 0;
                    } else {
                        e = f[l >> 2] | 0;
                        g = f[e + (k + -1 << 3) >> 2] | 0;
                    }
                    m = f[e + (k << 3) >> 2] | 0;
                    i = f[e + (k << 3) + 4 >> 2] & 255;
                    while (1) {
                        if ((g | 0) >= (m | 0))
                            break;
                        b[K + g >> 0] = i;
                        b:
                            do
                                switch (b[I + g >> 0] | 0) {
                                case 18:
                                    break;
                                case 7: {
                                        e = g + 1 | 0;
                                        if ((e | 0) < (H | 0)) {
                                            if ((d[G + (g << 1) >> 1] | 0) == 13 ? (d[G + (e << 1) >> 1] | 0) == 10 : 0)
                                                break b;
                                            gb(o, i);
                                        }
                                        break;
                                    }
                                default:
                                    if (!((hb(o, g) | 0) << 24 >> 24))
                                        break a;
                                }
                            while (0);
                        g = g + 1 | 0;
                    }
                    k = k + 1 | 0;
                }
            if ((J | 0) == 89) {
                u = L;
                return F | 0;
            }
            f[c >> 2] = 7;
            K = 0;
            u = L;
            return K | 0;
        }
        fb(a, D);
        d[C >> 1] = i & 255;
        w = a + 93 | 0;
        x = a + 136 | 0;
        v = a + 132 | 0;
        r = 0;
        p = 0;
        s = 0;
        g = 0;
        m = 0;
        c = i;
        q = i;
        e = 0;
        t = 0;
        c:
            while (1) {
                if ((t | 0) >= (H | 0))
                    break;
                o = I + t | 0;
                l = b[o >> 0] | 0;
                n = l & 255;
                d:
                    do
                        switch (l << 24 >> 24) {
                        case 15:
                        case 12:
                        case 14:
                        case 11: {
                                e = e | 262144;
                                b[K + t >> 0] = c;
                                if ((l + -11 & 255) < 2)
                                    i = q + 2 & 126;
                                else
                                    i = (q & 127) + 1 << 24 >> 24 | 1;
                                if (!((p | s | 0) == 0 & (i & 255) < 126)) {
                                    k = r;
                                    p = p + ((s | 0) == 0 & 1) | 0;
                                    l = s;
                                    i = q;
                                    break d;
                                }
                                switch (l << 24 >> 24) {
                                case 15:
                                case 12: {
                                        i = i | -128;
                                        break;
                                    }
                                default: {
                                    }
                                }
                                g = g + 1 | 0;
                                d[C + (g << 1) >> 1] = i & 255;
                                k = r;
                                l = s;
                                m = t;
                                break;
                            }
                        case 16: {
                                e = e | 262144;
                                b[K + t >> 0] = c;
                                if (!s) {
                                    if (p | 0) {
                                        k = r;
                                        p = p + -1 | 0;
                                        l = 0;
                                        i = q;
                                        break d;
                                    }
                                    if (g) {
                                        n = g + -1 | 0;
                                        if ((j[C + (g << 1) >> 1] | 0) < 256) {
                                            k = r;
                                            p = 0;
                                            l = 0;
                                            m = t;
                                            i = d[C + (n << 1) >> 1] & 255;
                                            g = n;
                                        } else {
                                            k = r;
                                            p = 0;
                                            l = 0;
                                            i = q;
                                        }
                                    } else {
                                        k = r;
                                        p = 0;
                                        l = 0;
                                        i = q;
                                        g = 0;
                                    }
                                } else {
                                    k = r;
                                    l = s;
                                    i = q;
                                }
                                break;
                            }
                        case 21:
                        case 20: {
                                k = q & 255;
                                e = e | f[96 + ((k & 1) << 2) >> 2];
                                i = k & 127;
                                b[K + t >> 0] = i;
                                if ((i | 0) == (c & 127 | 0))
                                    e = e | 1024;
                                else {
                                    ib(D, m, c, q);
                                    e = e | -2147482624;
                                }
                                l = l << 24 >> 24 == 20 ? k + 2 & 382 : i + 1 | 1;
                                i = l & 255;
                                if (!((p | s | 0) == 0 & (l & 254) >>> 0 < 126)) {
                                    b[o >> 0] = 9;
                                    c = q;
                                    k = r;
                                    l = s + 1 | 0;
                                    i = q;
                                    break d;
                                }
                                k = r + 1 | 0;
                                if ((r | 0) >= (f[y >> 2] | 0))
                                    f[y >> 2] = k;
                                g = g + 1 | 0;
                                d[C + (g << 1) >> 1] = l | 256;
                                jb(D, i);
                                c = q;
                                l = s;
                                m = t;
                                e = e | 1 << n;
                                break;
                            }
                        case 22: {
                                if ((c ^ q) & 127) {
                                    ib(D, m, c, q);
                                    e = e | -2147483648;
                                }
                                do
                                    if (!s) {
                                        if (!r) {
                                            b[o >> 0] = 9;
                                            k = 0;
                                            i = p;
                                            l = 0;
                                            break;
                                        }
                                        do {
                                            s = g;
                                            g = g + -1 | 0;
                                        } while ((j[C + (s << 1) >> 1] | 0) < 256);
                                        kb(D);
                                        k = r + -1 | 0;
                                        i = 0;
                                        l = 0;
                                        m = t;
                                        e = e | 4194304;
                                    } else {
                                        b[o >> 0] = 9;
                                        k = r;
                                        i = p;
                                        l = s + -1 | 0;
                                    }
                                while (0);
                                c = d[C + (g << 1) >> 1] | 0;
                                s = c & 255;
                                c = c & 255;
                                e = e | f[96 + ((c & 1) << 2) >> 2] | 1024;
                                b[K + t >> 0] = c & 127;
                                c = s;
                                p = i;
                                i = s;
                                break;
                            }
                        case 7: {
                                e = e | 128;
                                if ((b[z >> 0] | 0) != 0 ? (A = f[x >> 2] | 0, (t | 0) >= (f[A >> 2] | 0)) : 0)
                                    i = Sa(f[v >> 2] | 0, A, t) | 0;
                                else
                                    i = b[w >> 0] | 0;
                                b[K + t >> 0] = i;
                                i = t + 1 | 0;
                                if ((i | 0) < (H | 0)) {
                                    if ((d[G + (t << 1) >> 1] | 0) == 13 ? (d[G + (i << 1) >> 1] | 0) == 10 : 0) {
                                        k = r;
                                        l = s;
                                        i = q;
                                        break d;
                                    }
                                    if ((b[z >> 0] | 0) != 0 ? (B = f[x >> 2] | 0, (i | 0) >= (f[B >> 2] | 0)) : 0)
                                        g = Sa(f[v >> 2] | 0, B, i) | 0;
                                    else
                                        g = b[w >> 0] | 0;
                                    d[C >> 1] = g & 255;
                                    gb(D, g);
                                    c = g;
                                    k = 0;
                                    p = 0;
                                    l = 0;
                                    i = g;
                                    g = 0;
                                } else {
                                    k = r;
                                    l = s;
                                    i = q;
                                }
                                break;
                            }
                        case 18: {
                                b[K + t >> 0] = c;
                                k = r;
                                l = s;
                                i = q;
                                e = e | 262144;
                                break;
                            }
                        default: {
                                i = q & 255;
                                if ((i & 127 | 0) == (c & 127 | 0))
                                    n = e;
                                else {
                                    ib(D, m, c, q);
                                    n = f[((i & 128 | 0) == 0 ? 240 : 232) + ((i & 1) << 2) >> 2] | (e | -2147483648);
                                }
                                b[K + t >> 0] = q;
                                if (!((hb(D, t) | 0) << 24 >> 24)) {
                                    F = -1;
                                    J = 89;
                                    break c;
                                }
                                c = q;
                                k = r;
                                l = s;
                                i = q;
                                e = 1 << h[o >> 0] | n;
                            }
                        }
                    while (0);
                r = k;
                s = l;
                q = i;
                t = t + 1 | 0;
            }
        if ((J | 0) == 89) {
            u = L;
            return F | 0;
        }
        if (e & 8380376)
            e = f[96 + ((b[w >> 0] & 1) << 2) >> 2] | e;
        K = e | (e & 128 | 0) != 0 & (b[a + 92 >> 0] | 0) != 0 & 1;
        f[E >> 2] = K;
        K = eb(K) | 0;
        u = L;
        return K | 0;
    }
    function Ya(a, c, e, g, h) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        h = h | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0;
        v = u;
        u = u + 32 | 0;
        s = v;
        t = f[a + 72 >> 2] | 0;
        if ((f[a + 124 >> 2] | 0) > (c | 0)) {
            if ((b[a + 94 >> 0] | 0) != 0 ? (i = f[a + 136 >> 2] | 0, (f[i >> 2] | 0) <= (c | 0)) : 0)
                i = Sa(f[a + 132 >> 2] | 0, i, c) | 0;
            else
                i = b[a + 93 >> 0] | 0;
            if (i & 1)
                q = ((f[a + 84 >> 2] | 0) + -5 | 0) >>> 0 < 2;
            else
                q = 0;
        } else
            q = 0;
        f[s + 12 >> 2] = -1;
        f[s + 16 >> 2] = -1;
        f[s + 24 >> 2] = c;
        r = b[(f[a + 76 >> 2] | 0) + c >> 0] | 0;
        b[s + 28 >> 0] = r;
        p = f[a + 112 >> 2] | 0;
        r = r & 1;
        f[s >> 2] = f[p + (r << 2) >> 2];
        f[s + 4 >> 2] = f[p + 8 + (r << 2) >> 2];
        if ((c | 0) == 0 ? (f[a + 100 >> 2] | 0) > 0 : 0) {
            i = $a(a) | 0;
            i = i << 24 >> 24 == 4 ? g : i;
        } else
            i = g;
        g = t + c | 0;
        r = a + 240 | 0;
        if ((b[g >> 0] | 0) == 22 ? (j = f[r >> 2] | 0, (j | 0) > -1) : 0) {
            o = f[a + 244 >> 2] | 0;
            f[s + 8 >> 2] = f[o + (j << 4) >> 2];
            g = f[o + (j << 4) + 4 >> 2] | 0;
            p = d[o + (j << 4) + 12 >> 1] | 0;
            f[s + 20 >> 2] = f[o + (j << 4) + 8 >> 2];
            f[r >> 2] = j + -1;
            j = p;
        } else {
            f[s + 8 >> 2] = -1;
            j = (b[g >> 0] | 0) == 17 ? (i & 255) + 1 & 65535 : 0;
            f[s + 20 >> 2] = 0;
            ab(a, s, i, c, c);
            g = c;
        }
        i = -1;
        m = 1;
        n = c;
        o = c;
        p = g;
        l = j;
        while (1) {
            if ((n | 0) > (e | 0))
                break;
            if ((n | 0) >= (e | 0)) {
                g = e;
                do {
                    g = g + -1 | 0;
                    j = b[t + g >> 0] | 0;
                    if ((g | 0) <= (c | 0))
                        break;
                } while ((1 << (j & 255) & 382976 | 0) != 0);
                if ((j & -2) << 24 >> 24 == 20)
                    break;
                else {
                    k = h;
                    j = m;
                }
            } else {
                g = b[t + n >> 0] | 0;
                if (g << 24 >> 24 == 7)
                    f[r >> 2] = -1;
                a:
                    do
                        if (q) {
                            switch (g << 24 >> 24) {
                            case 13: {
                                    g = 1;
                                    j = m;
                                    break a;
                                }
                            case 2:
                                break;
                            default: {
                                    j = m;
                                    break a;
                                }
                            }
                            b:
                                do
                                    if ((i | 0) > (n | 0))
                                        j = m;
                                    else {
                                        i = n;
                                        while (1) {
                                            i = i + 1 | 0;
                                            if ((i | 0) >= (e | 0)) {
                                                g = 2;
                                                i = e;
                                                j = 1;
                                                break a;
                                            }
                                            g = b[t + i >> 0] | 0;
                                            switch (g << 24 >> 24) {
                                            case 13:
                                            case 1:
                                            case 0: {
                                                    j = g;
                                                    break b;
                                                }
                                            default: {
                                                }
                                            }
                                        }
                                    }
                                while (0);
                            g = j << 24 >> 24 == 13 ? 5 : 2;
                        } else
                            j = m;
                    while (0);
                k = b[68582 + (g & 255) >> 0] | 0;
            }
            g = l & 65535;
            k = b[(k & 255) + (68607 + (g << 4)) >> 0] | 0;
            l = k & 31;
            k = (k & 255) >>> 5;
            k = (n | 0) == (e | 0) & k << 24 >> 24 == 0 ? 1 : k & 255;
            c:
                do
                    if (!(k << 16 >> 16)) {
                        k = o;
                        g = p;
                    } else {
                        g = b[68607 + (g << 4) + 15 >> 0] | 0;
                        switch (k & 7) {
                        case 1: {
                                ab(a, s, g, p, n);
                                k = o;
                                g = n;
                                break c;
                            }
                        case 2: {
                                k = n;
                                g = p;
                                break c;
                            }
                        case 3: {
                                ab(a, s, g, p, o);
                                ab(a, s, 4, o, n);
                                k = o;
                                g = n;
                                break c;
                            }
                        case 4: {
                                ab(a, s, g, p, o);
                                k = n;
                                g = o;
                                break c;
                            }
                        default: {
                                k = o;
                                g = p;
                                break c;
                            }
                        }
                    }
                while (0);
            m = j;
            n = n + 1 | 0;
            o = k;
            p = g;
        }
        k = a + 12 | 0;
        if ((f[k >> 2] | 0) == (e | 0) ? (f[a + 108 >> 2] | 0) > 0 : 0) {
            i = bb(a) | 0;
            i = i << 24 >> 24 == 4 ? h : i;
        } else
            i = h;
        g = e;
        do {
            g = g + -1 | 0;
            j = b[t + g >> 0] | 0;
            if ((g | 0) <= (c | 0))
                break;
        } while ((1 << (j & 255) & 382976 | 0) != 0);
        if ((j & -2) << 24 >> 24 == 20 ? (f[k >> 2] | 0) > (e | 0) : 0) {
            e = (f[r >> 2] | 0) + 1 | 0;
            f[r >> 2] = e;
            t = a + 244 | 0;
            d[(f[t >> 2] | 0) + (e << 4) + 12 >> 1] = l;
            f[(f[t >> 2] | 0) + (f[r >> 2] << 4) + 8 >> 2] = f[s + 20 >> 2];
            f[(f[t >> 2] | 0) + (f[r >> 2] << 4) + 4 >> 2] = p;
            f[(f[t >> 2] | 0) + (f[r >> 2] << 4) >> 2] = f[s + 8 >> 2];
            u = v;
            return;
        }
        ab(a, s, i, e, e);
        u = v;
        return;
    }
    function Za(a) {
        a = a | 0;
        var c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0;
        l = f[a + 72 >> 2] | 0;
        n = f[a + 76 >> 2] | 0;
        if (!(f[a + 120 >> 2] & 8248192))
            return;
        h = (b[a + 92 >> 0] | 0) != 0;
        i = a + 94 | 0;
        j = a + 93 | 0;
        k = a + 136 | 0;
        g = a + 132 | 0;
        a = f[a + 128 >> 2] | 0;
        while (1) {
            if ((a | 0) <= 0)
                break;
            while (1) {
                if ((a | 0) <= 0)
                    break;
                d = a + -1 | 0;
                c = b[l + d >> 0] | 0;
                if (!(1 << (c & 255) & 8248192)) {
                    a = d;
                    break;
                }
                do
                    if (h & c << 24 >> 24 == 7)
                        a = 0;
                    else {
                        if (b[i >> 0] | 0 ? (m = f[k >> 2] | 0, (a | 0) > (f[m >> 2] | 0)) : 0) {
                            a = Sa(f[g >> 2] | 0, m, d) | 0;
                            break;
                        }
                        a = b[j >> 0] | 0;
                    }
                while (0);
                b[n + d >> 0] = a;
                a = d;
            }
            while (1) {
                if ((a | 0) <= 0)
                    break;
                e = a + -1 | 0;
                c = b[l + e >> 0] | 0;
                d = 1 << (c & 255);
                if (!(d & 382976)) {
                    if (h & c << 24 >> 24 == 7) {
                        a = 0;
                        p = 24;
                        break;
                    }
                    if (d & 384 | 0) {
                        p = 20;
                        break;
                    }
                } else
                    b[n + e >> 0] = b[n + a >> 0] | 0;
                a = e;
            }
            do
                if ((p | 0) == 20) {
                    if (b[i >> 0] | 0 ? (o = f[k >> 2] | 0, (a | 0) > (f[o >> 2] | 0)) : 0) {
                        a = Sa(f[g >> 2] | 0, o, e) | 0;
                        p = 24;
                        break;
                    }
                    a = b[j >> 0] | 0;
                    p = 24;
                }
            while (0);
            if ((p | 0) == 24) {
                p = 0;
                b[n + e >> 0] = a;
                a = e;
            }
        }
        return;
    }
    function _a(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0, g = 0, h = 0, i = 0, j = 0, k = 0;
        k = a + 328 | 0;
        d = f[k >> 2] | 0;
        do
            if (!d) {
                g = _b(80) | 0;
                d = a + 344 | 0;
                f[d >> 2] = g;
                if (g | 0) {
                    f[k >> 2] = 10;
                    i = d;
                    e = g;
                    h = 10;
                    break;
                }
                f[a + 340 >> 2] = 7;
                return;
            } else {
                i = a + 344 | 0;
                g = f[i >> 2] | 0;
                e = g;
                h = d;
            }
        while (0);
        j = a + 332 | 0;
        d = f[j >> 2] | 0;
        do
            if ((d | 0) >= (h | 0)) {
                e = $b(g, h << 4) | 0;
                f[i >> 2] = e;
                if (e | 0) {
                    f[k >> 2] = f[k >> 2] << 1;
                    d = f[j >> 2] | 0;
                    break;
                }
                f[i >> 2] = g;
                f[a + 340 >> 2] = 7;
                return;
            }
        while (0);
        f[e + (d << 3) >> 2] = b;
        f[e + (d << 3) + 4 >> 2] = c;
        f[j >> 2] = (f[j >> 2] | 0) + 1;
        return;
    }
    function $a(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0;
        e = f[a + 96 >> 2] | 0;
        b = f[a + 100 >> 2] | 0;
        a:
            while (1) {
                if ((b | 0) <= 0) {
                    b = 4;
                    c = 8;
                    break;
                }
                d = b + -1 | 0;
                c = j[e + (d << 1) >> 1] | 0;
                if ((b | 0) != 1 & (c & 64512 | 0) == 56320) {
                    b = b + -2 | 0;
                    h = j[e + (b << 1) >> 1] | 0;
                    g = (h & 64512 | 0) == 55296;
                    c = g ? c + -56613888 + (h << 10) | 0 : c;
                    b = g ? b : d;
                } else
                    b = d;
                switch (((cb(a, c) | 0) & 255) << 24 >> 24) {
                case 13:
                case 1: {
                        c = 6;
                        break a;
                    }
                case 7: {
                        c = 7;
                        break a;
                    }
                case 0: {
                        b = 0;
                        c = 8;
                        break a;
                    }
                default: {
                    }
                }
            }
        if ((c | 0) == 6) {
            h = 1;
            return h | 0;
        } else if ((c | 0) == 7) {
            h = 4;
            return h | 0;
        } else if ((c | 0) == 8)
            return b | 0;
        return 0;
    }
    function ab(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0;
        l = f[c >> 2] | 0;
        p = f[c + 4 >> 2] | 0;
        s = a + 76 | 0;
        t = f[s >> 2] | 0;
        o = c + 20 | 0;
        k = f[o >> 2] & 255;
        q = h[(d & 255) + (l + (k << 3)) >> 0] | 0;
        r = q & 15;
        f[o >> 2] = r;
        r = b[l + (r << 3) + 7 >> 0] | 0;
        a:
            do
                switch (b[p + (q >>> 4) >> 0] | 0) {
                case 14: {
                        l = c + 8 | 0;
                        m = (b[c + 28 >> 0] | 0) + 1 << 24 >> 24;
                        i = e;
                        while (1) {
                            k = i + -1 | 0;
                            if ((i | 0) <= (f[l >> 2] | 0)) {
                                i = e;
                                break a;
                            }
                            i = t + k | 0;
                            j = b[i >> 0] | 0;
                            if ((j & 255) > (m & 255))
                                b[i >> 0] = (j & 255) + 254;
                            i = k;
                        }
                    }
                case 1: {
                        f[c + 8 >> 2] = e;
                        i = e;
                        break;
                    }
                case 2: {
                        i = f[c + 8 >> 2] | 0;
                        break;
                    }
                case 3: {
                        db(f[a + 72 >> 2] | 0, f[s >> 2] | 0, f[c + 8 >> 2] | 0, e, (h[c + 28 >> 0] | 0) + 1 & 255);
                        i = e;
                        break;
                    }
                case 4: {
                        db(f[a + 72 >> 2] | 0, f[s >> 2] | 0, f[c + 8 >> 2] | 0, e, (h[c + 28 >> 0] | 0) + 2 & 255);
                        i = e;
                        break;
                    }
                case 5: {
                        i = c + 12 | 0;
                        j = f[i >> 2] | 0;
                        if ((j | 0) > -1)
                            _a(a, j, 1);
                        f[i >> 2] = -1;
                        if (f[a + 328 >> 2] | 0 ? (m = a + 332 | 0, n = a + 336 | 0, (f[m >> 2] | 0) > (f[n >> 2] | 0)) : 0) {
                            j = c + 16 | 0;
                            i = f[j >> 2] | 0;
                            while (1) {
                                i = i + 1 | 0;
                                if ((i | 0) >= (e | 0))
                                    break;
                                q = t + i | 0;
                                b[q >> 0] = (b[q >> 0] | 0) + -2 << 24 >> 24 & -2;
                            }
                            f[n >> 2] = f[m >> 2];
                            f[j >> 2] = -1;
                            if (d << 24 >> 24 != 5) {
                                i = e;
                                break a;
                            }
                            _a(a, e, 1);
                            f[n >> 2] = f[m >> 2];
                            i = e;
                            break a;
                        }
                        f[c + 16 >> 2] = -1;
                        if (!(b[l + (k << 3) + 7 >> 0] & 1))
                            i = e;
                        else {
                            i = f[c + 8 >> 2] | 0;
                            i = (i | 0) > 0 ? i : e;
                        }
                        if (d << 24 >> 24 == 5) {
                            _a(a, e, 1);
                            f[a + 336 >> 2] = f[a + 332 >> 2];
                        }
                        break;
                    }
                case 6: {
                        if ((f[a + 328 >> 2] | 0) > 0)
                            f[a + 332 >> 2] = f[a + 336 >> 2];
                        f[c + 8 >> 2] = -1;
                        f[c + 12 >> 2] = -1;
                        f[c + 16 >> 2] = g + -1;
                        i = e;
                        break;
                    }
                case 7: {
                        if ((d << 24 >> 24 == 3 ? (b[(f[a + 72 >> 2] | 0) + e >> 0] | 0) == 5 : 0) ? (f[a + 84 >> 2] | 0) != 6 : 0) {
                            i = c + 12 | 0;
                            j = f[i >> 2] | 0;
                            if ((j | 0) == -1) {
                                f[c + 16 >> 2] = g + -1;
                                i = e;
                                break a;
                            }
                            if ((j | 0) > -1) {
                                _a(a, j, 1);
                                f[i >> 2] = -2;
                            }
                            _a(a, e, 1);
                            i = e;
                            break a;
                        }
                        i = c + 12 | 0;
                        if ((f[i >> 2] | 0) == -1) {
                            f[i >> 2] = e;
                            i = e;
                        } else
                            i = e;
                        break;
                    }
                case 8: {
                        f[c + 16 >> 2] = g + -1;
                        f[c + 8 >> 2] = -1;
                        i = e;
                        break;
                    }
                case 9: {
                        i = e;
                        while (1) {
                            q = i;
                            i = i + -1 | 0;
                            if ((q | 0) <= 0)
                                break;
                            if (b[t + i >> 0] & 1) {
                                j = 36;
                                break;
                            }
                        }
                        if ((j | 0) == 36) {
                            _a(a, i, 4);
                            f[a + 336 >> 2] = f[a + 332 >> 2];
                        }
                        f[c + 8 >> 2] = e;
                        i = e;
                        break;
                    }
                case 10: {
                        _a(a, e, 1);
                        _a(a, e, 2);
                        i = e;
                        break;
                    }
                case 11: {
                        i = a + 336 | 0;
                        j = a + 332 | 0;
                        f[j >> 2] = f[i >> 2];
                        if (d << 24 >> 24 == 5) {
                            _a(a, e, 4);
                            f[i >> 2] = f[j >> 2];
                            i = e;
                        } else
                            i = e;
                        break;
                    }
                case 12: {
                        l = (h[c + 28 >> 0] | 0) + (r & 255) | 0;
                        j = l & 255;
                        k = c + 8 | 0;
                        l = l & 255;
                        i = f[k >> 2] | 0;
                        while (1) {
                            if ((i | 0) >= (e | 0))
                                break;
                            m = t + i | 0;
                            if (l >>> 0 > (h[m >> 0] | 0) >>> 0)
                                b[m >> 0] = j;
                            i = i + 1 | 0;
                        }
                        f[a + 336 >> 2] = f[a + 332 >> 2];
                        f[k >> 2] = e;
                        i = e;
                        break;
                    }
                case 13: {
                        n = b[c + 28 >> 0] | 0;
                        d = c + 8 | 0;
                        q = n & 255;
                        o = q + 3 | 0;
                        p = q + 2 | 0;
                        q = q + 1 & 255;
                        i = e;
                        while (1) {
                            k = i + -1 | 0;
                            if ((i | 0) <= (f[d >> 2] | 0)) {
                                i = e;
                                break a;
                            }
                            j = t + k | 0;
                            l = b[j >> 0] | 0;
                            m = l & 255;
                            if ((o | 0) == (m | 0)) {
                                i = k;
                                j = l;
                                while (1) {
                                    if ((o | 0) != (j & 255 | 0))
                                        break;
                                    j = i + -1 | 0;
                                    b[t + i >> 0] = q;
                                    i = j;
                                    j = b[t + j >> 0] | 0;
                                }
                                l = i;
                                while (1) {
                                    i = l + -1 | 0;
                                    if (j << 24 >> 24 != n << 24 >> 24)
                                        break;
                                    l = i;
                                    j = b[t + i >> 0] | 0;
                                }
                                i = l;
                                k = j & 255;
                                j = t + l | 0;
                            } else {
                                i = k;
                                k = m;
                            }
                            b[j >> 0] = (p | 0) == (k | 0) ? n : q;
                        }
                    }
                default:
                    i = e;
                }
            while (0);
        if (!(r << 24 >> 24 != 0 | (i | 0) < (e | 0)))
            return;
        j = (h[c + 28 >> 0] | 0) + (r & 255) & 255;
        if ((i | 0) < (f[c + 24 >> 2] | 0)) {
            db(f[a + 72 >> 2] | 0, f[s >> 2] | 0, i, g, j);
            return;
        }
        while (1) {
            if ((i | 0) >= (g | 0))
                break;
            b[t + i >> 0] = j;
            i = i + 1 | 0;
        }
        return;
    }
    function bb(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0;
        e = f[a + 104 >> 2] | 0;
        g = f[a + 108 >> 2] | 0;
        b = 0;
        a:
            while (1) {
                if ((b | 0) >= (g | 0)) {
                    b = 4;
                    c = 7;
                    break;
                }
                d = b + 1 | 0;
                c = j[e + (b << 1) >> 1] | 0;
                if ((d | 0) == (g | 0) | (c & 64512 | 0) != 55296)
                    b = d;
                else {
                    i = j[e + (d << 1) >> 1] | 0;
                    h = (i & 64512 | 0) == 56320;
                    c = h ? (c << 10) + -56613888 + i | 0 : c;
                    b = h ? b + 2 | 0 : d;
                }
                switch (((cb(a, c) | 0) & 255) << 24 >> 24) {
                case 0: {
                        b = 0;
                        c = 7;
                        break a;
                    }
                case 13:
                case 1: {
                        c = 8;
                        break a;
                    }
                case 5: {
                        c = 6;
                        break a;
                    }
                case 2: {
                        b = 2;
                        c = 9;
                        break a;
                    }
                default: {
                    }
                }
            }
        if ((c | 0) == 6) {
            i = 3;
            return i | 0;
        } else if ((c | 0) == 7) {
            i = b;
            return i | 0;
        } else if ((c | 0) == 8) {
            i = 1;
            return i | 0;
        } else if ((c | 0) == 9)
            return b | 0;
        return 0;
    }
    function cb(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0;
        d = f[a + 352 >> 2] | 0;
        if (!((d | 0) != 0 ? (c = sa[d & 0](f[a + 356 >> 2] | 0, b) | 0, (c | 0) != 23) : 0))
            c = gc(b) | 0;
        return ((c | 0) > 22 ? 10 : c) | 0;
    }
    function db(a, c, d, e, f) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        var g = 0, h = 0;
        g = 0;
        while (1) {
            if ((d | 0) >= (e | 0))
                break;
            h = b[a + d >> 0] | 0;
            g = g + ((h << 24 >> 24 == 22) << 31 >> 31) | 0;
            if (!g)
                b[c + d >> 0] = f;
            d = d + 1 | 0;
            g = g + ((h & -2) << 24 >> 24 == 20 & 1) | 0;
        }
        return;
    }
    function eb(a) {
        a = a | 0;
        if ((a & 2154498 | 0) == 0 ? (a & 32 | 0) == 0 | (a & 8249304 | 0) == 0 : 0) {
            a = 0;
            return a | 0;
        }
        a = (a & 26220581 | 0) == 0 ? 1 : 2;
        return a | 0;
    }
    function fb(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0;
        f[c >> 2] = a;
        f[c + 492 >> 2] = 0;
        d[c + 500 >> 1] = 0;
        d[c + 502 >> 1] = 0;
        h = a + 94 | 0;
        if ((b[h >> 0] | 0) != 0 ? (e = f[a + 136 >> 2] | 0, (f[e >> 2] | 0) <= 0) : 0)
            e = Sa(f[a + 132 >> 2] | 0, e, 0) | 0;
        else
            e = b[a + 93 >> 0] | 0;
        b[c + 504 >> 0] = e;
        if ((b[h >> 0] | 0) != 0 ? (g = f[a + 136 >> 2] | 0, (f[g >> 2] | 0) <= 0) : 0)
            e = Sa(f[a + 132 >> 2] | 0, g, 0) | 0;
        else
            e = b[a + 93 >> 0] | 0;
        e = e & 1;
        b[c + 506 >> 0] = e;
        b[c + 505 >> 0] = e;
        f[c + 508 >> 2] = e & 255;
        f[c + 496 >> 2] = 0;
        e = f[a + 52 >> 2] | 0;
        if (!e) {
            f[c + 484 >> 2] = c + 4;
            g = 20;
            h = c + 488 | 0;
            f[h >> 2] = g;
            a = a + 84 | 0;
            a = f[a >> 2] | 0;
            h = (a | 0) == 1;
            a = (a | 0) == 6;
            a = h | a;
            a = a & 1;
            c = c + 2528 | 0;
            b[c >> 0] = a;
            return;
        } else {
            f[c + 484 >> 2] = e;
            g = ((f[a + 28 >> 2] | 0) >>> 0) / 24 | 0;
            h = c + 488 | 0;
            f[h >> 2] = g;
            a = a + 84 | 0;
            a = f[a >> 2] | 0;
            h = (a | 0) == 1;
            a = (a | 0) == 6;
            a = h | a;
            a = a & 1;
            c = c + 2528 | 0;
            b[c >> 0] = a;
            return;
        }
    }
    function gb(a, c) {
        a = a | 0;
        c = c | 0;
        f[a + 492 >> 2] = 0;
        d[a + 502 >> 1] = 0;
        b[a + 504 >> 0] = c;
        c = c & 1;
        b[a + 506 >> 0] = c;
        b[a + 505 >> 0] = c;
        f[a + 508 >> 2] = c & 255;
        f[a + 496 >> 2] = 0;
        return;
    }
    function hb(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0;
        s = f[a + 492 >> 2] | 0;
        p = a + 496 + (s << 4) | 0;
        e = f[a >> 2] | 0;
        r = (f[e + 72 >> 2] | 0) + c | 0;
        m = b[r >> 0] | 0;
        do
            if (m << 24 >> 24 == 10) {
                e = d[(f[e + 4 >> 2] | 0) + (c << 1) >> 1] | 0;
                l = a + 496 + (s << 4) + 4 | 0;
                g = j[l >> 1] | 0;
                o = a + 484 | 0;
                i = e & 65535;
                n = j[a + 496 + (s << 4) + 6 >> 1] | 0;
                while (1) {
                    t = n;
                    n = n + -1 | 0;
                    if ((t | 0) <= (g | 0))
                        break;
                    if ((f[(f[o >> 2] | 0) + (n * 24 | 0) + 4 >> 2] | 0) == (i | 0)) {
                        q = 5;
                        break;
                    }
                }
                if ((q | 0) == 5) {
                    e = lb(a, n, c) | 0;
                    if (e << 24 >> 24 == 10)
                        break;
                    b[a + 496 + (s << 4) + 10 >> 0] = 10;
                    f[a + 496 + (s << 4) + 12 >> 2] = e & 255;
                    f[p >> 2] = c;
                    e = f[(f[a >> 2] | 0) + 76 >> 2] | 0;
                    g = h[e + c >> 0] | 0;
                    if (g & 128) {
                        g = g & 1;
                        b[a + 496 + (s << 4) + 9 >> 0] = g;
                        g = 1 << g;
                        e = j[l >> 1] | 0;
                        while (1) {
                            if ((e | 0) >= (n | 0))
                                break;
                            t = (f[o >> 2] | 0) + (e * 24 | 0) + 12 | 0;
                            d[t >> 1] = g | j[t >> 1];
                            e = e + 1 | 0;
                        }
                        e = (f[(f[a >> 2] | 0) + 76 >> 2] | 0) + c | 0;
                        b[e >> 0] = b[e >> 0] & 127;
                        e = f[(f[a >> 2] | 0) + 76 >> 2] | 0;
                    }
                    t = e + (f[(f[o >> 2] | 0) + (n * 24 | 0) >> 2] | 0) | 0;
                    b[t >> 0] = b[t >> 0] & 127;
                    t = 1;
                    return t | 0;
                }
                if ((e << 16 >> 16 ? (k = (mc(i) | 0) & 65535, e << 16 >> 16 != k << 16 >> 16) : 0) ? (jc(i) | 0) == 1 : 0) {
                    a:
                        do
                            if (k << 16 >> 16 < 12297) {
                                switch (k << 16 >> 16) {
                                case 9002:
                                    break;
                                default:
                                    break a;
                                }
                                if (!((mb(a, 12297, c) | 0) << 24 >> 24)) {
                                    t = 0;
                                    return t | 0;
                                }
                            } else {
                                switch (k << 16 >> 16) {
                                case 12297:
                                    break;
                                default:
                                    break a;
                                }
                                if (!((mb(a, 9002, c) | 0) << 24 >> 24)) {
                                    t = 0;
                                    return t | 0;
                                }
                            }
                        while (0);
                    if (!((mb(a, k, c) | 0) << 24 >> 24)) {
                        t = 0;
                        return t | 0;
                    }
                }
            }
        while (0);
        e = h[(f[(f[a >> 2] | 0) + 76 >> 2] | 0) + c >> 0] | 0;
        b:
            do
                if (!(e & 128))
                    switch (m << 24 >> 24) {
                    case 0:
                    case 1:
                    case 13: {
                            e = m << 24 >> 24 != 0;
                            b[a + 496 + (s << 4) + 10 >> 0] = m;
                            b[a + 496 + (s << 4) + 9 >> 0] = m;
                            f[a + 496 + (s << 4) + 12 >> 2] = e & 1;
                            f[p >> 2] = c;
                            e = e & 1;
                            q = 35;
                            break b;
                        }
                    case 2: {
                            b[a + 496 + (s << 4) + 10 >> 0] = 2;
                            switch (b[a + 496 + (s << 4) + 9 >> 0] | 0) {
                            case 0: {
                                    if (!(b[a + 2528 >> 0] | 0))
                                        b[r >> 0] = 23;
                                    f[a + 496 + (s << 4) + 12 >> 2] = 0;
                                    f[p >> 2] = c;
                                    e = 0;
                                    break b;
                                }
                            case 13: {
                                    e = 5;
                                    break;
                                }
                            default:
                                e = 24;
                            }
                            b[r >> 0] = e;
                            f[a + 496 + (s << 4) + 12 >> 2] = 1;
                            f[p >> 2] = c;
                            e = 1;
                            break b;
                        }
                    case 5: {
                            b[a + 496 + (s << 4) + 10 >> 0] = 5;
                            f[a + 496 + (s << 4) + 12 >> 2] = 1;
                            f[p >> 2] = c;
                            e = 1;
                            break b;
                        }
                    case 17: {
                            e = b[a + 496 + (s << 4) + 10 >> 0] | 0;
                            if (e << 24 >> 24 != 10) {
                                q = 35;
                                break b;
                            }
                            b[r >> 0] = 10;
                            t = 1;
                            return t | 0;
                        }
                    default: {
                            b[a + 496 + (s << 4) + 10 >> 0] = m;
                            e = m;
                            q = 35;
                            break b;
                        }
                    }
                else {
                    g = e & 1;
                    e = g & 255;
                    if ((m + -8 & 255) >= 3)
                        b[r >> 0] = e;
                    b[a + 496 + (s << 4) + 10 >> 0] = e;
                    b[a + 496 + (s << 4) + 9 >> 0] = e;
                    f[a + 496 + (s << 4) + 12 >> 2] = g;
                    f[p >> 2] = c;
                    q = 35;
                }
            while (0);
        c:
            do
                if ((q | 0) == 35) {
                    switch (e << 24 >> 24) {
                    case 0:
                    case 1:
                    case 13:
                        break c;
                    default:
                        e = 1;
                    }
                    return e | 0;
                }
            while (0);
        i = 1 << (e << 24 >> 24 != 0 & 1);
        k = a + 496 + (s << 4) + 6 | 0;
        l = a + 484 | 0;
        e = j[a + 496 + (s << 4) + 4 >> 1] | 0;
        while (1) {
            if (e >>> 0 >= (j[k >> 1] | 0) >>> 0) {
                e = 1;
                break;
            }
            g = f[l >> 2] | 0;
            if ((f[g + (e * 24 | 0) >> 2] | 0) < (c | 0)) {
                t = g + (e * 24 | 0) + 12 | 0;
                d[t >> 1] = i | j[t >> 1];
            }
            e = e + 1 | 0;
        }
        return e | 0;
    }
    function ib(a, c, e, g) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        var i = 0;
        i = f[a + 492 >> 2] | 0;
        if (1 << (h[(f[(f[a >> 2] | 0) + 72 >> 2] | 0) + c >> 0] | 0) & 7864320 | 0)
            return;
        d[a + 496 + (i << 4) + 6 >> 1] = d[a + 496 + (i << 4) + 4 >> 1] | 0;
        b[a + 496 + (i << 4) + 8 >> 0] = g;
        g = ((g & 127) > (e & 127) ? g : e) & 1;
        b[a + 496 + (i << 4) + 10 >> 0] = g;
        b[a + 496 + (i << 4) + 9 >> 0] = g;
        f[a + 496 + (i << 4) + 12 >> 2] = g & 255;
        f[a + 496 + (i << 4) >> 2] = c;
        return;
    }
    function jb(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0;
        g = a + 492 | 0;
        h = f[g >> 2] | 0;
        e = a + 496 + (h << 4) | 0;
        b[a + 496 + (h << 4) + 10 >> 0] = 10;
        a = d[a + 496 + (h << 4) + 6 >> 1] | 0;
        f[g >> 2] = h + 1;
        d[e + 22 >> 1] = a;
        d[e + 20 >> 1] = a;
        b[e + 24 >> 0] = c;
        c = c & 1;
        b[e + 26 >> 0] = c;
        b[e + 25 >> 0] = c;
        f[e + 28 >> 2] = c & 255;
        f[e + 16 >> 2] = 0;
        return;
    }
    function kb(a) {
        a = a | 0;
        var c = 0, d = 0;
        d = a + 492 | 0;
        c = (f[d >> 2] | 0) + -1 | 0;
        f[d >> 2] = c;
        b[a + 496 + (c << 4) + 10 >> 0] = 10;
        return;
    }
    function lb(a, c, e) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        var g = 0, h = 0, i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0;
        o = f[a + 492 >> 2] | 0;
        q = a + 484 | 0;
        m = f[q >> 2] | 0;
        i = b[a + 496 + (o << 4) + 8 >> 0] & 1;
        g = i & 255;
        h = d[m + (c * 24 | 0) + 12 >> 1] | 0;
        if (!(i << 24 >> 24))
            if (!(h & 1))
                l = 4;
            else {
                p = 0;
                k = 0;
            }
        else if (!(h & 2))
            l = 4;
        else {
            p = 1;
            k = 0;
        }
        do
            if ((l | 0) == 4) {
                if (h & 3) {
                    p = f[m + (c * 24 | 0) + 16 >> 2] | 0;
                    p = (p | 0) == (g | 0) ? i : p & 255;
                    k = (j[a + 496 + (o << 4) + 4 >> 1] | 0 | 0) != (c | 0);
                    break;
                }
                d[a + 496 + (o << 4) + 6 >> 1] = c;
                q = 10;
                return q | 0;
            }
        while (0);
        n = m + (c * 24 | 0) | 0;
        b[(f[(f[a >> 2] | 0) + 72 >> 2] | 0) + (f[n >> 2] | 0) >> 0] = p;
        b[(f[(f[a >> 2] | 0) + 72 >> 2] | 0) + e >> 0] = p;
        nb(a, c, f[n >> 2] | 0, p);
        if (!k) {
            h = a + 496 + (o << 4) + 6 | 0;
            g = d[a + 496 + (o << 4) + 4 >> 1] | 0;
            i = c & 65535;
            while (1) {
                d[h >> 1] = i;
                if ((i & 65535) <= (g & 65535)) {
                    g = p;
                    l = 21;
                    break;
                }
                if ((f[(f[q >> 2] | 0) + (((i & 65535) + -1 | 0) * 24 | 0) >> 2] | 0) == (f[n >> 2] | 0))
                    i = i + -1 << 16 >> 16;
                else {
                    g = p;
                    l = 21;
                    break;
                }
            }
            if ((l | 0) == 21)
                return g | 0;
        }
        f[m + (c * 24 | 0) + 4 >> 2] = 0 - e;
        i = a + 496 + (o << 4) + 4 | 0;
        g = c;
        while (1) {
            h = g + -1 | 0;
            if ((g | 0) <= (j[i >> 1] | 0 | 0))
                break;
            g = f[q >> 2] | 0;
            if ((f[g + (h * 24 | 0) >> 2] | 0) != (f[n >> 2] | 0))
                break;
            f[g + (h * 24 | 0) + 4 >> 2] = 0;
            g = h;
        }
        h = a + 496 + (o << 4) + 6 | 0;
        while (1) {
            c = c + 1 | 0;
            if ((c | 0) >= (j[h >> 1] | 0 | 0)) {
                g = p;
                l = 21;
                break;
            }
            g = f[q >> 2] | 0;
            if ((f[g + (c * 24 | 0) >> 2] | 0) >= (e | 0)) {
                g = p;
                l = 21;
                break;
            }
            g = g + (c * 24 | 0) + 4 | 0;
            if ((f[g >> 2] | 0) > 0)
                f[g >> 2] = 0;
        }
        if ((l | 0) == 21)
            return g | 0;
        return 0;
    }
    function mb(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0, i = 0, k = 0, l = 0, m = 0;
        l = f[a + 492 >> 2] | 0;
        m = a + 496 + (l << 4) + 6 | 0;
        e = j[m >> 1] | 0;
        k = a + 488 | 0;
        if ((f[k >> 2] | 0) > (e | 0))
            g = f[a + 484 >> 2] | 0;
        else {
            i = f[a >> 2] | 0;
            h = i + 52 | 0;
            i = i + 28 | 0;
            if (!((Pa(h, i, 1, e * 48 | 0) | 0) << 24 >> 24)) {
                m = 0;
                return m | 0;
            }
            e = a + 484 | 0;
            g = f[e >> 2] | 0;
            if ((g | 0) == (a + 4 | 0))
                Uc(f[h >> 2] | 0, g | 0, 480) | 0;
            g = f[h >> 2] | 0;
            f[e >> 2] = g;
            f[k >> 2] = ((f[i >> 2] | 0) >>> 0) / 24 | 0;
            e = j[m >> 1] | 0;
        }
        f[g + (e * 24 | 0) >> 2] = c;
        f[g + (e * 24 | 0) + 4 >> 2] = b & 65535;
        f[g + (e * 24 | 0) + 16 >> 2] = f[a + 496 + (l << 4) + 12 >> 2];
        f[g + (e * 24 | 0) + 8 >> 2] = f[a + 496 + (l << 4) >> 2];
        d[g + (e * 24 | 0) + 12 >> 1] = 0;
        d[m >> 1] = (d[m >> 1] | 0) + 1 << 16 >> 16;
        m = 1;
        return m | 0;
    }
    function nb(a, c, d, e) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        var g = 0, h = 0, i = 0, k = 0, l = 0, m = 0, n = 0;
        m = f[(f[a >> 2] | 0) + 72 >> 2] | 0;
        g = c + 1 | 0;
        h = e & 255;
        i = a + 496 + (f[a + 492 >> 2] << 4) + 6 | 0;
        c = (f[a + 484 >> 2] | 0) + (g * 24 | 0) | 0;
        while (1) {
            if ((g | 0) >= (j[i >> 1] | 0 | 0)) {
                c = 9;
                break;
            }
            k = c + 4 | 0;
            if ((f[k >> 2] | 0) <= -1) {
                if ((f[c + 8 >> 2] | 0) > (d | 0)) {
                    c = 9;
                    break;
                }
                l = f[c >> 2] | 0;
                if ((l | 0) > (d | 0)) {
                    if ((f[c + 16 >> 2] | 0) == (h | 0)) {
                        c = 9;
                        break;
                    }
                    b[m + l >> 0] = e;
                    n = 0 - (f[k >> 2] | 0) | 0;
                    b[m + n >> 0] = e;
                    f[k >> 2] = 0;
                    nb(a, g, l, e);
                    nb(a, g, n, e);
                }
            }
            c = c + 24 | 0;
            g = g + 1 | 0;
        }
        if ((c | 0) == 9)
            return;
    }
    function ob(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, k = 0;
        g = f[a + 96 >> 2] | 0;
        h = f[a + 100 >> 2] | 0;
        e = 0;
        b = 10;
        while (1) {
            if ((e | 0) >= (h | 0))
                break;
            d = e + 1 | 0;
            c = j[g + (e << 1) >> 1] | 0;
            if ((d | 0) == (h | 0) | (c & 64512 | 0) != 55296)
                e = d;
            else {
                k = j[g + (d << 1) >> 1] | 0;
                i = (k & 64512 | 0) == 56320;
                c = i ? (c << 10) + -56613888 + k | 0 : c;
                e = i ? e + 2 | 0 : d;
            }
            c = cb(a, c) | 0;
            d = c & 255;
            a:
                do
                    if (b << 24 >> 24 == 10) {
                        switch (d << 24 >> 24) {
                        case 13:
                        case 1:
                        case 0:
                            break;
                        default: {
                                b = 10;
                                break a;
                            }
                        }
                        b = d;
                    } else
                        b = (c & 255 | 0) == 7 ? 10 : b;
                while (0);
        }
        return b | 0;
    }
    function pb(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0;
        c = f[a + 132 >> 2] | 0;
        d = a + 136 | 0;
        b = f[d >> 2] | 0;
        if ((b | 0) != (a + 140 | 0)) {
            b = a + 56 | 0;
            if (!((Pa(b, a + 32 | 0, 1, c << 4) | 0) << 24 >> 24)) {
                d = 0;
                return d | 0;
            }
            f[d >> 2] = f[b >> 2];
            d = 1;
            return d | 0;
        }
        if ((c | 0) < 11) {
            d = 1;
            return d | 0;
        }
        c = a + 56 | 0;
        if (!((Pa(c, a + 32 | 0, 1, 160) | 0) << 24 >> 24)) {
            d = 0;
            return d | 0;
        }
        a = f[c >> 2] | 0;
        f[d >> 2] = a;
        c = a + 80 | 0;
        do {
            f[a >> 2] = f[b >> 2];
            a = a + 4 | 0;
            b = b + 4 | 0;
        } while ((a | 0) < (c | 0));
        d = 1;
        return d | 0;
    }
    function qb(a) {
        a = a | 0;
        var b = 0;
        do
            if (!a)
                a = 0;
            else {
                b = f[a >> 2] | 0;
                if ((b | 0) != (a | 0)) {
                    if (!b) {
                        a = 0;
                        break;
                    }
                    if ((f[b >> 2] | 0) != (b | 0)) {
                        a = 0;
                        break;
                    }
                }
                a = f[a + 12 >> 2] | 0;
            }
        while (0);
        return a | 0;
    }
    function rb(a) {
        a = a | 0;
        var b = 0;
        do
            if (!a)
                a = 0;
            else {
                b = f[a >> 2] | 0;
                if ((b | 0) != (a | 0)) {
                    if (!b) {
                        a = 0;
                        break;
                    }
                    if ((f[b >> 2] | 0) != (b | 0)) {
                        a = 0;
                        break;
                    }
                }
                a = f[a + 132 >> 2] | 0;
            }
        while (0);
        return a | 0;
    }
    function sb(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0;
        if (!d)
            return;
        if ((Oa(f[d >> 2] | 0) | 0) << 24 >> 24)
            return;
        do
            if (a | 0) {
                e = f[a >> 2] | 0;
                if ((e | 0) != (a | 0)) {
                    if (!e)
                        break;
                    if ((f[e >> 2] | 0) != (e | 0))
                        break;
                }
                if ((b | 0) >= 0 ? (f[a + 132 >> 2] | 0) > (b | 0) : 0) {
                    if (!c)
                        return;
                    f[c >> 2] = f[(f[e + 136 >> 2] | 0) + (b << 3) >> 2];
                    return;
                }
                f[d >> 2] = 1;
                return;
            }
        while (0);
        f[d >> 2] = 27;
        return;
    }
    function tb(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0;
        if (!c) {
            e = -1;
            return e | 0;
        }
        if ((Oa(f[c >> 2] | 0) | 0) << 24 >> 24) {
            e = -1;
            return e | 0;
        }
        do
            if (a | 0) {
                e = f[a >> 2] | 0;
                if ((e | 0) != (a | 0)) {
                    if (!e)
                        break;
                    if ((f[e >> 2] | 0) != (e | 0))
                        break;
                }
                if ((b | 0) >= 0 ? (f[e + 12 >> 2] | 0) > (b | 0) : 0) {
                    d = f[e + 136 >> 2] | 0;
                    a = 0;
                    while (1)
                        if ((f[d + (a << 3) >> 2] | 0) > (b | 0))
                            break;
                        else
                            a = a + 1 | 0;
                    sb(e, a, 0, c);
                    e = a;
                    return e | 0;
                }
                f[c >> 2] = 1;
                e = -1;
                return e | 0;
            }
        while (0);
        f[c >> 2] = 27;
        e = -1;
        return e | 0;
    }
    function ub(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        var g = 0;
        if (!e) {
            e = 0;
            return e | 0;
        }
        if ((vb(f[e >> 2] | 0) | 0) << 24 >> 24) {
            e = 0;
            return e | 0;
        }
        if (!((a | 0) == 0 | (b | 0) < -1 | (d | 0) < 0) ? (g = (c | 0) == 0, !(g & (d | 0) > 0)) : 0) {
            do
                if (!g) {
                    if (!(a >>> 0 >= c >>> 0 & (c + (d << 1) | 0) >>> 0 > a >>> 0) ? !(c >>> 0 >= a >>> 0 & (a + (b << 1) | 0) >>> 0 > c >>> 0) : 0)
                        break;
                    f[e >> 2] = 1;
                    e = 0;
                    return e | 0;
                }
            while (0);
            if ((b | 0) == -1)
                b = bc(a) | 0;
            if ((b | 0) > 0)
                b = wb(a, b, c, d, 10, e) | 0;
            else
                b = 0;
            e = dc(c, d, b, e) | 0;
            return e | 0;
        }
        f[e >> 2] = 1;
        e = 0;
        return e | 0;
    }
    function vb(a) {
        a = a | 0;
        return (a | 0) > 0 | 0;
    }
    function wb(a, b, c, e, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        h = h | 0;
        var i = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0;
        l = g & 65535;
        switch (l & 11) {
        case 0: {
                if ((e | 0) < (b | 0)) {
                    f[h >> 2] = 15;
                    o = b;
                    return o | 0;
                }
                k = b;
                g = c;
                while (1) {
                    i = k + -1 | 0;
                    c = k + -2 | 0;
                    if ((k | 0) > 1 ? (d[a + (i << 1) >> 1] & -1024) << 16 >> 16 == -9216 : 0)
                        i = (d[a + (c << 1) >> 1] & -1024) << 16 >> 16 == -10240 ? c : i;
                    c = i;
                    do {
                        n = c;
                        c = c + 1 | 0;
                        o = g;
                        g = g + 2 | 0;
                        d[o >> 1] = d[a + (n << 1) >> 1] | 0;
                    } while ((c | 0) < (k | 0));
                    if ((i | 0) > 0)
                        k = i;
                    else {
                        g = b;
                        break;
                    }
                }
                return g | 0;
            }
        case 1: {
                if ((e | 0) < (b | 0)) {
                    f[h >> 2] = 15;
                    o = b;
                    return o | 0;
                }
                h = b;
                e = c;
                while (1) {
                    c = h;
                    while (1) {
                        i = c + -1 | 0;
                        g = j[a + (i << 1) >> 1] | 0;
                        if ((c | 0) > 1 & (g & 64512 | 0) == 56320) {
                            c = c + -2 | 0;
                            n = j[a + (c << 1) >> 1] | 0;
                            o = (n & 64512 | 0) == 55296;
                            g = o ? g + -56613888 + (n << 10) | 0 : g;
                            c = o ? c : i;
                        } else
                            c = i;
                        if ((c | 0) <= 0) {
                            k = 0;
                            break;
                        }
                        if (!(1 << ((fc(g) | 0) << 24 >> 24) & 448)) {
                            k = 1;
                            break;
                        }
                    }
                    i = c;
                    g = e;
                    do {
                        n = i;
                        i = i + 1 | 0;
                        o = g;
                        g = g + 2 | 0;
                        d[o >> 1] = d[a + (n << 1) >> 1] | 0;
                    } while ((i | 0) < (h | 0));
                    if (k) {
                        h = c;
                        e = g;
                    } else {
                        g = b;
                        break;
                    }
                }
                return g | 0;
            }
        default: {
                n = (l & 8 | 0) != 0;
                if (n) {
                    i = a;
                    k = b;
                    g = 0;
                    while (1) {
                        m = i;
                        i = i + 2 | 0;
                        m = j[m >> 1] | 0;
                        g = g + ((((m + -8294 | 0) >>> 0 < 4 | ((m & 65532 | 0) == 8204 | (m + -8234 | 0) >>> 0 < 5)) ^ 1) & 1) | 0;
                        if ((k | 0) <= 1)
                            break;
                        else
                            k = k + -1 | 0;
                    }
                    a = i + (0 - b << 1) | 0;
                } else
                    g = b;
                if ((g | 0) > (e | 0)) {
                    f[h >> 2] = 15;
                    o = g;
                    return o | 0;
                }
                m = (l & 1 | 0) == 0;
                l = (l & 2 | 0) == 0;
                h = b;
                while (1) {
                    k = h + -1 | 0;
                    i = j[a + (k << 1) >> 1] | 0;
                    if ((h | 0) > 1 & (i & 64512 | 0) == 56320) {
                        b = h + -2 | 0;
                        p = j[a + (b << 1) >> 1] | 0;
                        e = (p & 64512 | 0) == 55296;
                        i = e ? i + -56613888 + (p << 10) | 0 : i;
                        k = e ? b : k;
                    }
                    a:
                        do
                            if (!m)
                                while (1) {
                                    if ((k | 0) <= 0)
                                        break a;
                                    if (!(1 << ((fc(i) | 0) << 24 >> 24) & 448))
                                        break a;
                                    e = k + -1 | 0;
                                    i = j[a + (e << 1) >> 1] | 0;
                                    if ((k | 0) > 1 & (i & 64512 | 0) == 56320) {
                                        k = k + -2 | 0;
                                        b = j[a + (k << 1) >> 1] | 0;
                                        p = (b & 64512 | 0) == 55296;
                                        i = p ? i + -56613888 + (b << 10) | 0 : i;
                                        k = p ? k : e;
                                    } else
                                        k = e;
                                }
                        while (0);
                    if (n) {
                        if ((i & -4 | 0) != 8204)
                            switch (i | 0) {
                            case 8234:
                            case 8235:
                            case 8236:
                            case 8237:
                            case 8238:
                            case 8294:
                            case 8295:
                            case 8296:
                            case 8297:
                                break;
                            default:
                                o = 40;
                            }
                    } else
                        o = 40;
                    b:
                        do
                            if ((o | 0) == 40) {
                                o = 0;
                                if (l)
                                    e = k;
                                else {
                                    i = lc(i) | 0;
                                    if (i >>> 0 < 65536) {
                                        d[c >> 1] = i;
                                        i = 1;
                                    } else {
                                        d[c >> 1] = (i >>> 10) + 55232;
                                        d[c + 2 >> 1] = i & 1023 | 56320;
                                        i = 2;
                                    }
                                    e = i + k | 0;
                                    c = c + (i << 1) | 0;
                                }
                                i = e;
                                while (1) {
                                    if ((i | 0) >= (h | 0))
                                        break b;
                                    d[c >> 1] = d[a + (i << 1) >> 1] | 0;
                                    i = i + 1 | 0;
                                    c = c + 2 | 0;
                                }
                            }
                        while (0);
                    if ((k | 0) > 0)
                        h = k;
                    else
                        break;
                }
                return g | 0;
            }
        }
        return 0;
    }
    function xb(a, c, e, g, i) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        i = i | 0;
        var j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0;
        z = u;
        u = u + 16 | 0;
        x = z + 4 | 0;
        y = z;
        if (!i) {
            i = 0;
            u = z;
            return i | 0;
        }
        if ((vb(f[i >> 2] | 0) | 0) << 24 >> 24) {
            i = 0;
            u = z;
            return i | 0;
        }
        if (((a | 0 ? (w = f[a + 4 >> 2] | 0, w | 0) : 0) ? (j = f[a + 12 >> 2] | 0, (j | e | 0) >= 0) : 0) ? (k = (c | 0) == 0, !(k & (e | 0) > 0)) : 0) {
            do
                if (!k) {
                    if (!(w >>> 0 >= c >>> 0 & w >>> 0 < (c + (e << 1) | 0) >>> 0)) {
                        if (w >>> 0 > c >>> 0)
                            break;
                        if ((w + (f[a + 8 >> 2] << 1) | 0) >>> 0 <= c >>> 0)
                            break;
                    }
                    f[i >> 2] = 1;
                    i = 0;
                    u = z;
                    return i | 0;
                }
            while (0);
            if (!j) {
                dc(c, e, 0, i) | 0;
                i = 0;
                u = z;
                return i | 0;
            }
            t = Db(a, i) | 0;
            if ((vb(f[i >> 2] | 0) | 0) << 24 >> 24) {
                i = 0;
                u = z;
                return i | 0;
            }
            k = f[a + 88 >> 2] | 0;
            v = g & -13;
            v = (k & 2 | 0) == 0 ? (k & 1 | 0) == 0 ? g : v | 4 : v | 8;
            v = ((f[a + 84 >> 2] | 0) + -3 | 0) >>> 0 < 4 ? v : v & -5;
            k = v & 65535;
            j = (k & 4 | 0) != 0;
            a:
                do
                    if (!(k & 16)) {
                        if (!j) {
                            n = k & 65533;
                            l = c;
                            j = e;
                            m = 0;
                            while (1) {
                                if ((m | 0) >= (t | 0))
                                    break a;
                                s = (Ib(a, m, x, y) | 0) == 0;
                                k = w + (f[x >> 2] << 1) | 0;
                                g = f[y >> 2] | 0;
                                if (s)
                                    k = yb(k, g, l, j, n, i) | 0;
                                else
                                    k = wb(k, g, l, j, v, i) | 0;
                                f[y >> 2] = k;
                                l = (l | 0) == 0 ? 0 : l + (k << 1) | 0;
                                j = j - k | 0;
                                m = m + 1 | 0;
                            }
                        }
                        q = f[a + 72 >> 2] | 0;
                        r = a + 224 | 0;
                        s = a + 80 | 0;
                        p = k & 65533;
                        j = e;
                        o = 0;
                        k = c;
                        while (1) {
                            if ((o | 0) >= (t | 0))
                                break a;
                            A = Ib(a, o, x, y) | 0;
                            l = f[x >> 2] | 0;
                            n = w + (l << 1) | 0;
                            g = f[(f[r >> 2] | 0) + (o * 12 | 0) + 8 >> 2] | 0;
                            g = (g | 0) > 0 ? g : 0;
                            m = (b[s >> 0] | 0) != 0;
                            do
                                if (!A) {
                                    if (m)
                                        g = g | (b[q + l >> 0] | 0) != 0;
                                    l = 8207 - (g & 1) << 16 >> 16;
                                    if (g & 5) {
                                        if ((j | 0) > 0) {
                                            d[k >> 1] = l;
                                            k = k + 2 | 0;
                                        }
                                        j = j + -1 | 0;
                                    }
                                    l = yb(n, f[y >> 2] | 0, k, j, p, i) | 0;
                                    f[y >> 2] = l;
                                    k = (k | 0) == 0 ? 0 : k + (l << 1) | 0;
                                    j = j - l | 0;
                                    if (b[s >> 0] | 0)
                                        g = (b[q + (l + -1 + (f[x >> 2] | 0)) >> 0] | 0) == 0 ? g : g | 2;
                                    if (!(g & 10))
                                        break;
                                    if ((j | 0) > 0) {
                                        d[k >> 1] = 8207 - (g >>> 1 & 1) << 16 >> 16;
                                        k = k + 2 | 0;
                                    }
                                    j = j + -1 | 0;
                                } else {
                                    if (m)
                                        g = (1 << h[q + (l + -1 + (f[y >> 2] | 0)) >> 0] & 8194 | 0) == 0 ? g | 4 : g;
                                    l = 8207 - (g & 1) << 16 >> 16;
                                    if (g & 5) {
                                        if ((j | 0) > 0) {
                                            d[k >> 1] = l;
                                            k = k + 2 | 0;
                                        }
                                        j = j + -1 | 0;
                                    }
                                    A = wb(n, f[y >> 2] | 0, k, j, v, i) | 0;
                                    f[y >> 2] = A;
                                    k = (k | 0) == 0 ? 0 : k + (A << 1) | 0;
                                    j = j - A | 0;
                                    if (b[s >> 0] | 0)
                                        g = (1 << h[q + (f[x >> 2] | 0) >> 0] & 8194 | 0) == 0 ? g | 8 : g;
                                    if (!(g & 10))
                                        break;
                                    if ((j | 0) > 0) {
                                        d[k >> 1] = 8207 - (g >>> 1 & 1) << 16 >> 16;
                                        k = k + 2 | 0;
                                    }
                                    j = j + -1 | 0;
                                }
                            while (0);
                            o = o + 1 | 0;
                        }
                    } else {
                        if (!j) {
                            n = k & 65533;
                            m = c;
                            k = t;
                            j = e;
                            while (1) {
                                l = k + -1 | 0;
                                if ((k | 0) <= 0)
                                    break a;
                                A = (Ib(a, l, x, y) | 0) == 0;
                                k = w + (f[x >> 2] << 1) | 0;
                                g = f[y >> 2] | 0;
                                if (A)
                                    g = wb(k, g, m, j, n, i) | 0;
                                else
                                    g = yb(k, g, m, j, v, i) | 0;
                                f[y >> 2] = g;
                                m = (m | 0) == 0 ? 0 : m + (g << 1) | 0;
                                k = l;
                                j = j - g | 0;
                            }
                        }
                        p = f[a + 72 >> 2] | 0;
                        o = k & 65533;
                        k = c;
                        g = t;
                        j = e;
                        while (1) {
                            n = g + -1 | 0;
                            if ((g | 0) <= 0)
                                break a;
                            A = Ib(a, n, x, y) | 0;
                            l = f[x >> 2] | 0;
                            m = w + (l << 1) | 0;
                            if (!A) {
                                g = f[y >> 2] | 0;
                                if (b[p + (l + -1 + g) >> 0] | 0) {
                                    if ((j | 0) > 0) {
                                        d[k >> 1] = 8206;
                                        k = k + 2 | 0;
                                        g = f[y >> 2] | 0;
                                    }
                                    j = j + -1 | 0;
                                }
                                A = wb(m, g, k, j, o, i) | 0;
                                f[y >> 2] = A;
                                k = (k | 0) == 0 ? 0 : k + (A << 1) | 0;
                                j = j - A | 0;
                                if (b[p + (f[x >> 2] | 0) >> 0] | 0) {
                                    if ((j | 0) > 0) {
                                        d[k >> 1] = 8206;
                                        k = k + 2 | 0;
                                    }
                                    j = j + -1 | 0;
                                }
                            } else {
                                if (!(1 << h[p + l >> 0] & 8194)) {
                                    if ((j | 0) > 0) {
                                        d[k >> 1] = 8207;
                                        k = k + 2 | 0;
                                    }
                                    j = j + -1 | 0;
                                }
                                A = yb(m, f[y >> 2] | 0, k, j, v, i) | 0;
                                f[y >> 2] = A;
                                k = (k | 0) == 0 ? 0 : k + (A << 1) | 0;
                                j = j - A | 0;
                                if (!(1 << h[p + (A + -1 + (f[x >> 2] | 0)) >> 0] & 8194)) {
                                    if ((j | 0) > 0) {
                                        d[k >> 1] = 8207;
                                        k = k + 2 | 0;
                                    }
                                    j = j + -1 | 0;
                                }
                            }
                            g = n;
                        }
                    }
                while (0);
            A = dc(c, e, e - j | 0, i) | 0;
            u = z;
            return A | 0;
        }
        f[i >> 2] = 1;
        A = 0;
        u = z;
        return A | 0;
    }
    function yb(a, b, c, e, g, h) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        h = h | 0;
        var i = 0, k = 0, l = 0, m = 0, n = 0;
        switch (g & 10) {
        case 0: {
                if ((e | 0) < (b | 0)) {
                    f[h >> 2] = 15;
                    e = b;
                    return e | 0;
                }
                i = b;
                g = c;
                while (1) {
                    d[g >> 1] = d[a >> 1] | 0;
                    if ((i | 0) > 1) {
                        a = a + 2 | 0;
                        i = i + -1 | 0;
                        g = g + 2 | 0;
                    } else {
                        g = b;
                        break;
                    }
                }
                return g | 0;
            }
        case 2: {
                if ((e | 0) < (b | 0)) {
                    f[h >> 2] = 15;
                    e = b;
                    return e | 0;
                }
                l = 0;
                i = 0;
                while (1) {
                    k = i + 1 | 0;
                    g = j[a + (i << 1) >> 1] | 0;
                    if ((k | 0) == (b | 0) | (g & 64512 | 0) != 55296)
                        i = k;
                    else {
                        m = j[a + (k << 1) >> 1] | 0;
                        e = (m & 64512 | 0) == 56320;
                        g = e ? (g << 10) + -56613888 + m | 0 : g;
                        i = e ? i + 2 | 0 : k;
                    }
                    g = lc(g) | 0;
                    if (g >>> 0 < 65536)
                        k = l + 1 | 0;
                    else {
                        d[c + (l + 1 << 1) >> 1] = g & 1023 | 56320;
                        k = l + 2 | 0;
                        g = (g >>> 10) + 55232 | 0;
                    }
                    d[c + (l << 1) >> 1] = g;
                    if ((i | 0) < (b | 0))
                        l = k;
                    else {
                        g = b;
                        break;
                    }
                }
                return g | 0;
            }
        case 8: {
                l = e;
                g = a;
                a = c;
                a:
                    while (1) {
                        k = g;
                        g = g + 2 | 0;
                        k = d[k >> 1] | 0;
                        b:
                            do
                                if ((k & -4) << 16 >> 16 == 8204)
                                    i = l;
                                else {
                                    switch (k << 16 >> 16) {
                                    case 8234:
                                    case 8235:
                                    case 8236:
                                    case 8237:
                                    case 8238:
                                    case 8294:
                                    case 8295:
                                    case 8296:
                                    case 8297: {
                                            i = l;
                                            break b;
                                        }
                                    default: {
                                        }
                                    }
                                    i = l + -1 | 0;
                                    if ((l | 0) < 1)
                                        break a;
                                    d[a >> 1] = k;
                                    a = a + 2 | 0;
                                }
                            while (0);
                        if ((b | 0) <= 1) {
                            m = 26;
                            break;
                        } else {
                            l = i;
                            b = b + -1 | 0;
                        }
                    }
                if ((m | 0) == 26) {
                    e = e - i | 0;
                    return e | 0;
                }
                f[h >> 2] = 15;
                a = b;
                while (1) {
                    if ((a | 0) <= 1)
                        break;
                    c = j[g >> 1] | 0;
                    i = i + ((((c + -8294 | 0) >>> 0 < 4 | ((c & 65532 | 0) == 8204 | (c + -8234 | 0) >>> 0 < 5)) ^ 1) << 31 >> 31) | 0;
                    a = a + -1 | 0;
                    g = g + 2 | 0;
                }
                e = e - i | 0;
                return e | 0;
            }
        default: {
                g = 0;
                k = e;
                i = b;
                c:
                    while (1) {
                        l = j[a >> 1] | 0;
                        if ((i | 0) == 1 | (l & 64512 | 0) != 55296)
                            b = 1;
                        else {
                            n = j[a + 2 >> 1] | 0;
                            b = (n & 64512 | 0) == 56320;
                            l = b ? (l << 10) + -56613888 + n | 0 : l;
                            b = b ? 2 : 1;
                        }
                        a = a + (b << 1) | 0;
                        i = i - b | 0;
                        d:
                            do
                                if ((l & -4 | 0) != 8204) {
                                    switch (l | 0) {
                                    case 8234:
                                    case 8235:
                                    case 8236:
                                    case 8237:
                                    case 8238:
                                    case 8294:
                                    case 8295:
                                    case 8296:
                                    case 8297:
                                        break d;
                                    default: {
                                        }
                                    }
                                    k = k - b | 0;
                                    if ((k | 0) < 0)
                                        break c;
                                    l = lc(l) | 0;
                                    if (l >>> 0 < 65536) {
                                        d[c + (g << 1) >> 1] = l;
                                        g = g + 1 | 0;
                                        break;
                                    } else {
                                        d[c + (g << 1) >> 1] = (l >>> 10) + 55232;
                                        d[c + (g + 1 << 1) >> 1] = l & 1023 | 56320;
                                        g = g + 2 | 0;
                                        break;
                                    }
                                }
                            while (0);
                        if ((i | 0) <= 0) {
                            m = 40;
                            break;
                        }
                    }
                if ((m | 0) == 40)
                    return g | 0;
                f[h >> 2] = 15;
                g = a;
                while (1) {
                    if ((i | 0) <= 0)
                        break;
                    n = j[g >> 1] | 0;
                    k = k + ((((n + -8294 | 0) >>> 0 < 4 | ((n & 65532 | 0) == 8204 | (n + -8234 | 0) >>> 0 < 5)) ^ 1) << 31 >> 31) | 0;
                    i = i + -1 | 0;
                    g = g + 2 | 0;
                }
                n = e - k | 0;
                return n | 0;
            }
        }
        return 0;
    }
    function zb(a, c, e, g, h) {
        a = a | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        h = h | 0;
        var i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0;
        if (!h)
            return;
        if ((Ab(f[h >> 2] | 0) | 0) << 24 >> 24)
            return;
        if (a | 0 ? (f[a >> 2] | 0) == (a | 0) : 0) {
            if (!((c | 0) > -1 & (e | 0) > (c | 0))) {
                f[h >> 2] = 1;
                return;
            }
            if ((e | 0) >= 0 ? (f[a + 12 >> 2] | 0) >= (e | 0) : 0) {
                if (!g) {
                    f[h >> 2] = 1;
                    return;
                }
                p = tb(a, c, h) | 0;
                if ((p | 0) != (tb(a, e + -1 | 0, h) | 0)) {
                    f[h >> 2] = 1;
                    return;
                }
                f[g >> 2] = 0;
                l = a + 4 | 0;
                f[g + 4 >> 2] = (f[l >> 2] | 0) + (c << 1);
                o = e - c | 0;
                f[g + 12 >> 2] = o;
                f[g + 8 >> 2] = o;
                m = g + 16 | 0;
                f[m >> 2] = o;
                if ((b[a + 94 >> 0] | 0) != 0 ? (i = f[a + 136 >> 2] | 0, (f[i >> 2] | 0) <= (c | 0)) : 0) {
                    h = a + 132 | 0;
                    j = h;
                    h = Sa(f[h >> 2] | 0, i, c) | 0;
                } else {
                    j = a + 132 | 0;
                    h = b[a + 93 >> 0] | 0;
                }
                p = g + 93 | 0;
                b[p >> 0] = h;
                f[g + 132 >> 2] = f[j >> 2];
                f[g + 224 >> 2] = 0;
                f[g + 120 >> 2] = 0;
                f[g + 84 >> 2] = f[a + 84 >> 2];
                f[g + 88 >> 2] = f[a + 88 >> 2];
                k = g + 348 | 0;
                f[k >> 2] = 0;
                if ((f[a + 348 >> 2] | 0) > 0) {
                    j = c;
                    h = 0;
                    while (1) {
                        if ((j | 0) >= (e | 0))
                            break;
                        i = d[(f[l >> 2] | 0) + (j << 1) >> 1] | 0;
                        if ((i & -4) << 16 >> 16 == 8204)
                            n = 24;
                        else
                            switch (i << 16 >> 16) {
                            case 8234:
                            case 8235:
                            case 8236:
                            case 8237:
                            case 8238:
                            case 8294:
                            case 8295:
                            case 8296:
                            case 8297: {
                                    n = 24;
                                    break;
                                }
                            default: {
                                }
                            }
                        if ((n | 0) == 24) {
                            n = 0;
                            h = h + 1 | 0;
                            f[k >> 2] = h;
                        }
                        j = j + 1 | 0;
                    }
                    f[m >> 2] = o - h;
                }
                f[g + 72 >> 2] = (f[a + 72 >> 2] | 0) + c;
                l = (f[a + 76 >> 2] | 0) + c | 0;
                f[g + 76 >> 2] = l;
                f[g + 220 >> 2] = -1;
                h = f[a + 116 >> 2] | 0;
                a:
                    do
                        if ((h | 0) != 2) {
                            f[g + 116 >> 2] = h;
                            h = f[a + 128 >> 2] | 0;
                            if ((h | 0) <= (c | 0)) {
                                f[g + 128 >> 2] = 0;
                                break;
                            }
                            if ((h | 0) < (e | 0)) {
                                f[g + 128 >> 2] = h - c;
                                break;
                            } else {
                                f[g + 128 >> 2] = o;
                                break;
                            }
                        } else {
                            Bb(g);
                            k = g + 128 | 0;
                            j = f[k >> 2] | 0;
                            b:
                                do
                                    if (!j)
                                        h = b[p >> 0] & 1;
                                    else {
                                        h = b[l >> 0] & 1;
                                        if ((j | 0) < (o | 0) ? (b[p >> 0] & 1) != h << 24 >> 24 : 0) {
                                            h = 2;
                                            break;
                                        }
                                        i = 1;
                                        while (1) {
                                            if ((i | 0) == (j | 0))
                                                break b;
                                            if ((b[l + i >> 0] & 1) == h << 24 >> 24)
                                                i = i + 1 | 0;
                                            else {
                                                h = 2;
                                                break;
                                            }
                                        }
                                    }
                                while (0);
                            f[g + 116 >> 2] = h & 255;
                            switch (h & 3) {
                            case 0: {
                                    b[p >> 0] = (b[p >> 0] | 0) + 1 << 24 >> 24 & -2;
                                    f[k >> 2] = 0;
                                    break a;
                                }
                            case 1: {
                                    b[p >> 0] = b[p >> 0] | 1;
                                    f[k >> 2] = 0;
                                    break a;
                                }
                            default:
                                break a;
                            }
                        }
                    while (0);
                f[g >> 2] = a;
                return;
            }
            f[h >> 2] = 1;
            return;
        }
        f[h >> 2] = 27;
        return;
    }
    function Ab(a) {
        a = a | 0;
        return (a | 0) > 0 | 0;
    }
    function Bb(a) {
        a = a | 0;
        var c = 0, d = 0, e = 0, g = 0, i = 0;
        e = f[a + 72 >> 2] | 0;
        g = f[a + 76 >> 2] | 0;
        c = f[a + 12 >> 2] | 0;
        i = b[a + 93 >> 0] | 0;
        if ((b[e + (c + -1) >> 0] | 0) == 7) {
            i = c;
            a = a + 128 | 0;
            f[a >> 2] = i;
            return;
        }
        while (1) {
            if ((c | 0) <= 0)
                break;
            d = c + -1 | 0;
            if (!(1 << h[e + d >> 0] & 8248192))
                break;
            else
                c = d;
        }
        while (1) {
            if ((c | 0) <= 0) {
                d = 8;
                break;
            }
            d = c + -1 | 0;
            if ((b[g + d >> 0] | 0) == i << 24 >> 24)
                c = d;
            else {
                d = 8;
                break;
            }
        }
        if ((d | 0) == 8) {
            a = a + 128 | 0;
            f[a >> 2] = c;
            return;
        }
    }
    function Cb(a, c) {
        a = a | 0;
        c = c | 0;
        var d = 0, e = 0, g = 0, h = 0, i = 0;
        if (!c) {
            i = 0;
            return i | 0;
        }
        if ((Ab(f[c >> 2] | 0) | 0) << 24 >> 24) {
            i = 0;
            return i | 0;
        }
        do
            if (a | 0) {
                d = f[a >> 2] | 0;
                if ((d | 0) != (a | 0)) {
                    if (!d)
                        break;
                    if ((f[d >> 2] | 0) != (d | 0))
                        break;
                }
                e = f[a + 12 >> 2] | 0;
                if ((e | 0) < 1) {
                    f[c >> 2] = 1;
                    i = 0;
                    return i | 0;
                }
                g = a + 128 | 0;
                h = f[g >> 2] | 0;
                if ((e | 0) == (h | 0)) {
                    i = f[a + 76 >> 2] | 0;
                    return i | 0;
                }
                d = a + 48 | 0;
                if (!((Pa(d, a + 24 | 0, b[a + 68 >> 0] | 0, e) | 0) << 24 >> 24)) {
                    f[c >> 2] = 7;
                    i = 0;
                    return i | 0;
                }
                d = f[d >> 2] | 0;
                c = a + 76 | 0;
                if ((h | 0) > 0 ? (i = f[c >> 2] | 0, (d | 0) != (i | 0)) : 0)
                    Uc(d | 0, i | 0, h | 0) | 0;
                Vc(d + h | 0, b[a + 93 >> 0] | 0, e - h | 0) | 0;
                f[g >> 2] = e;
                f[c >> 2] = d;
                i = d;
                return i | 0;
            }
        while (0);
        f[c >> 2] = 27;
        i = 0;
        return i | 0;
    }
    function Db(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0;
        if (!b) {
            c = -1;
            return c | 0;
        }
        if ((Ab(f[b >> 2] | 0) | 0) << 24 >> 24) {
            c = -1;
            return c | 0;
        }
        do
            if (a | 0) {
                c = f[a >> 2] | 0;
                if ((c | 0) != (a | 0)) {
                    if (!c)
                        break;
                    if ((f[c >> 2] | 0) != (c | 0))
                        break;
                }
                Eb(a, b);
                if ((Ab(f[b >> 2] | 0) | 0) << 24 >> 24) {
                    c = -1;
                    return c | 0;
                }
                c = f[a + 220 >> 2] | 0;
                return c | 0;
            }
        while (0);
        f[b >> 2] = 27;
        c = -1;
        return c | 0;
    }
    function Eb(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0;
        s = a + 220 | 0;
        if ((f[s >> 2] | 0) > -1)
            return;
        do
            if ((f[a + 116 >> 2] | 0) == 2) {
                o = f[a + 12 >> 2] | 0;
                r = f[a + 76 >> 2] | 0;
                p = f[a + 128 >> 2] | 0;
                e = 0;
                i = 0;
                g = -2;
                while (1) {
                    if ((e | 0) >= (p | 0))
                        break;
                    q = b[r + e >> 0] | 0;
                    e = e + 1 | 0;
                    i = i + (q << 24 >> 24 != g << 24 >> 24 & 1) | 0;
                    g = q;
                }
                if ((o | 0) == (p | 0) & (i | 0) == 1) {
                    Fb(a, b[r >> 0] | 0);
                    break;
                }
                l = (o | 0) > (p | 0);
                q = i + (l & 1) | 0;
                e = a + 60 | 0;
                if (!((Pa(e, a + 36 | 0, b[a + 69 >> 0] | 0, q * 12 | 0) | 0) << 24 >> 24))
                    return;
                n = f[e >> 2] | 0;
                m = 0;
                e = 126;
                k = 0;
                i = 0;
                while (1) {
                    g = b[r + i >> 0] | 0;
                    e = (g & 255) < (e & 255) ? g : e;
                    k = (g & 255) > (k & 255) ? g : k;
                    j = i;
                    while (1) {
                        j = j + 1 | 0;
                        if ((j | 0) >= (p | 0)) {
                            g = 0;
                            break;
                        }
                        if ((b[r + j >> 0] | 0) != g << 24 >> 24) {
                            g = 1;
                            break;
                        }
                    }
                    f[n + (m * 12 | 0) >> 2] = i;
                    f[n + (m * 12 | 0) + 4 >> 2] = j - i;
                    f[n + (m * 12 | 0) + 8 >> 2] = 0;
                    m = m + 1 | 0;
                    if (!g)
                        break;
                    else
                        i = j;
                }
                if (l) {
                    f[n + (m * 12 | 0) >> 2] = p;
                    f[n + (m * 12 | 0) + 4 >> 2] = o - p;
                    p = b[a + 93 >> 0] | 0;
                    e = (p & 255) < (e & 255) ? p : e;
                }
                f[a + 224 >> 2] = n;
                f[s >> 2] = q;
                Gb(a, e, k);
                e = 0;
                g = 0;
                while (1) {
                    if ((g | 0) == (q | 0))
                        break;
                    o = n + (g * 12 | 0) | 0;
                    p = f[o >> 2] | 0;
                    f[o >> 2] = h[r + p >> 0] << 31 | p;
                    o = n + (g * 12 | 0) + 4 | 0;
                    p = (f[o >> 2] | 0) + e | 0;
                    f[o >> 2] = p;
                    e = p;
                    g = g + 1 | 0;
                }
                if (m >>> 0 < q >>> 0) {
                    q = h[a + 93 >> 0] | 0;
                    r = n + (((q & 1 | 0) == 0 ? m : 0) * 12 | 0) | 0;
                    f[r >> 2] = q << 31 | f[r >> 2];
                }
            } else
                Fb(a, b[a + 93 >> 0] | 0);
        while (0);
        e = f[a + 332 >> 2] | 0;
        a:
            do
                if ((e | 0) > 0) {
                    r = f[a + 344 >> 2] | 0;
                    g = r + (e << 3) | 0;
                    i = a + 224 | 0;
                    e = r;
                    while (1) {
                        if (e >>> 0 >= g >>> 0)
                            break a;
                        r = Hb(f[s >> 2] | 0, f[i >> 2] | 0, f[e >> 2] | 0, c) | 0;
                        r = (f[i >> 2] | 0) + (r * 12 | 0) + 8 | 0;
                        f[r >> 2] = f[r >> 2] | f[e + 4 >> 2];
                        e = e + 8 | 0;
                    }
                }
            while (0);
        if ((f[a + 348 >> 2] | 0) <= 0)
            return;
        e = f[a + 4 >> 2] | 0;
        j = e + (f[a + 12 >> 2] << 1) | 0;
        k = e;
        g = a + 224 | 0;
        while (1) {
            if (e >>> 0 >= j >>> 0)
                break;
            i = d[e >> 1] | 0;
            if ((i & -4) << 16 >> 16 == 8204)
                t = 31;
            else
                switch (i << 16 >> 16) {
                case 8234:
                case 8235:
                case 8236:
                case 8237:
                case 8238:
                case 8294:
                case 8295:
                case 8296:
                case 8297: {
                        t = 31;
                        break;
                    }
                default: {
                    }
                }
            if ((t | 0) == 31) {
                t = 0;
                a = Hb(f[s >> 2] | 0, f[g >> 2] | 0, e - k >> 1, c) | 0;
                a = (f[g >> 2] | 0) + (a * 12 | 0) + 8 | 0;
                f[a >> 2] = (f[a >> 2] | 0) + -1;
            }
            e = e + 2 | 0;
        }
        return;
    }
    function Fb(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0;
        c = a + 228 | 0;
        f[a + 224 >> 2] = c;
        f[a + 220 >> 2] = 1;
        f[c >> 2] = (b & 255) << 31;
        f[a + 232 >> 2] = f[a + 12 >> 2];
        f[a + 236 >> 2] = 0;
        return;
    }
    function Gb(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0, g = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0;
        o = u;
        u = u + 16 | 0;
        n = o;
        if (((b | 1) & 255) >= (c & 255)) {
            u = o;
            return;
        }
        l = b + 1 << 24 >> 24;
        m = f[a + 224 >> 2] | 0;
        i = f[a + 76 >> 2] | 0;
        j = a + 128 | 0;
        k = a + 12 | 0;
        g = (f[a + 220 >> 2] | 0) + (((f[j >> 2] | 0) < (f[k >> 2] | 0)) << 31 >> 31) | 0;
        b = c;
        while (1) {
            b = b + -1 << 24 >> 24;
            if ((b & 255) < (l & 255))
                break;
            a = 0;
            while (1) {
                if ((a | 0) >= (g | 0))
                    break;
                if ((h[i + (f[m + (a * 12 | 0) >> 2] | 0) >> 0] | 0) >= (b & 255)) {
                    c = a;
                    while (1) {
                        e = c + 1 | 0;
                        if ((e | 0) >= (g | 0))
                            break;
                        if ((h[i + (f[m + (e * 12 | 0) >> 2] | 0) >> 0] | 0) < (b & 255))
                            break;
                        else
                            c = e;
                    }
                    d = c;
                    while (1) {
                        if ((a | 0) >= (d | 0))
                            break;
                        q = m + (a * 12 | 0) | 0;
                        f[n >> 2] = f[q >> 2];
                        f[n + 4 >> 2] = f[q + 4 >> 2];
                        f[n + 8 >> 2] = f[q + 8 >> 2];
                        p = m + (d * 12 | 0) | 0;
                        f[q >> 2] = f[p >> 2];
                        f[q + 4 >> 2] = f[p + 4 >> 2];
                        f[q + 8 >> 2] = f[p + 8 >> 2];
                        f[p >> 2] = f[n >> 2];
                        f[p + 4 >> 2] = f[n + 4 >> 2];
                        f[p + 8 >> 2] = f[n + 8 >> 2];
                        d = d + -1 | 0;
                        a = a + 1 | 0;
                    }
                    if ((e | 0) == (g | 0))
                        break;
                    else
                        a = c + 2 | 0;
                } else
                    a = a + 1 | 0;
            }
        }
        if (l & 1) {
            u = o;
            return;
        }
        b = g + (((f[j >> 2] | 0) == (f[k >> 2] | 0)) << 31 >> 31) | 0;
        a = 0;
        while (1) {
            if ((a | 0) >= (b | 0))
                break;
            p = m + (a * 12 | 0) | 0;
            f[n >> 2] = f[p >> 2];
            f[n + 4 >> 2] = f[p + 4 >> 2];
            f[n + 8 >> 2] = f[p + 8 >> 2];
            q = m + (b * 12 | 0) | 0;
            f[p >> 2] = f[q >> 2];
            f[p + 4 >> 2] = f[q + 4 >> 2];
            f[p + 8 >> 2] = f[q + 8 >> 2];
            f[q >> 2] = f[n >> 2];
            f[q + 4 >> 2] = f[n + 4 >> 2];
            f[q + 8 >> 2] = f[n + 8 >> 2];
            b = b + -1 | 0;
            a = a + 1 | 0;
        }
        u = o;
        return;
    }
    function Hb(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0, h = 0, i = 0, j = 0;
        g = 0;
        e = 0;
        while (1) {
            if ((e | 0) >= (a | 0))
                break;
            h = f[b + (e * 12 | 0) + 4 >> 2] | 0;
            j = f[b + (e * 12 | 0) >> 2] & 2147483647;
            if ((j | 0) <= (c | 0) ? (h - g + j | 0) > (c | 0) : 0) {
                i = 7;
                break;
            }
            g = h;
            e = e + 1 | 0;
        }
        if ((i | 0) == 7)
            return e | 0;
        f[d >> 2] = 27;
        j = 0;
        return j | 0;
    }
    function Ib(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0, h = 0;
        h = u;
        u = u + 16 | 0;
        e = h;
        f[e >> 2] = 0;
        do
            if (a | 0) {
                g = f[a >> 2] | 0;
                if ((g | 0) != (a | 0)) {
                    if (!g)
                        break;
                    if ((f[g >> 2] | 0) != (g | 0))
                        break;
                }
                Eb(a, e);
                if ((Ab(f[e >> 2] | 0) | 0) << 24 >> 24) {
                    d = 0;
                    u = h;
                    return d | 0;
                }
                if ((b | 0) >= 0 ? (f[a + 220 >> 2] | 0) > (b | 0) : 0) {
                    a = a + 224 | 0;
                    e = f[(f[a >> 2] | 0) + (b * 12 | 0) >> 2] | 0;
                    if (c | 0)
                        f[c >> 2] = e & 2147483647;
                    if (d | 0) {
                        a = f[a >> 2] | 0;
                        if ((b | 0) > 0)
                            a = (f[a + (b * 12 | 0) + 4 >> 2] | 0) - (f[a + ((b + -1 | 0) * 12 | 0) + 4 >> 2] | 0) | 0;
                        else
                            a = f[a + 4 >> 2] | 0;
                        f[d >> 2] = a;
                    }
                    d = e >>> 31;
                    u = h;
                    return d | 0;
                }
                f[e >> 2] = 1;
                d = 0;
                u = h;
                return d | 0;
            }
        while (0);
        f[e >> 2] = 27;
        d = 0;
        u = h;
        return d | 0;
    }
    function Jb(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0;
        if (!c)
            return;
        if ((Ab(f[c >> 2] | 0) | 0) << 24 >> 24)
            return;
        if (!b) {
            f[c >> 2] = 1;
            return;
        }
        Db(a, c) | 0;
        if (!((Kb(f[c >> 2] | 0) | 0) << 24 >> 24))
            return;
        m = a + 224 | 0;
        c = f[m >> 2] | 0;
        k = a + 220 | 0;
        l = c + ((f[k >> 2] | 0) * 12 | 0) | 0;
        n = a + 16 | 0;
        if ((f[n >> 2] | 0) < 1)
            return;
        g = 0;
        e = b;
        while (1) {
            if (c >>> 0 >= l >>> 0)
                break;
            h = f[c >> 2] | 0;
            j = f[c + 4 >> 2] | 0;
            if ((h | 0) > -1)
                while (1) {
                    i = e + 4 | 0;
                    f[e >> 2] = h;
                    g = g + 1 | 0;
                    if ((g | 0) < (j | 0)) {
                        h = h + 1 | 0;
                        e = i;
                    } else {
                        e = i;
                        break;
                    }
                }
            else {
                i = j - g + (h & 2147483647) | 0;
                while (1) {
                    i = i + -1 | 0;
                    h = e + 4 | 0;
                    f[e >> 2] = i;
                    g = g + 1 | 0;
                    if ((g | 0) >= (j | 0)) {
                        e = h;
                        break;
                    } else
                        e = h;
                }
            }
            c = c + 12 | 0;
        }
        if ((f[a + 332 >> 2] | 0) > 0) {
            g = f[k >> 2] | 0;
            m = f[m >> 2] | 0;
            e = 0;
            c = 0;
            while (1) {
                if ((c | 0) >= (g | 0))
                    break;
                p = f[m + (c * 12 | 0) + 8 >> 2] | 0;
                e = e + ((p & 5 | 0) != 0 & 1) + ((p & 10 | 0) != 0 & 1) | 0;
                c = c + 1 | 0;
            }
            c = f[n >> 2] | 0;
            while (1) {
                l = g + -1 | 0;
                if (!((g | 0) > 0 & (e | 0) > 0))
                    break;
                k = f[m + (l * 12 | 0) + 8 >> 2] | 0;
                h = c + -1 | 0;
                if (k & 10) {
                    f[b + (h << 2) >> 2] = -1;
                    c = h;
                    e = e + -1 | 0;
                }
                if ((g | 0) > 1)
                    j = f[m + ((g + -2 | 0) * 12 | 0) + 4 >> 2] | 0;
                else
                    j = 0;
                i = (e | 0) > 0;
                h = f[m + (l * 12 | 0) + 4 >> 2] | 0;
                while (1) {
                    g = h + -1 | 0;
                    if (!(i & (h | 0) > (j | 0)))
                        break;
                    p = c + -1 | 0;
                    f[b + (p << 2) >> 2] = f[b + (g << 2) >> 2];
                    h = g;
                    c = p;
                }
                g = c + -1 | 0;
                if (k & 5) {
                    f[b + (g << 2) >> 2] = -1;
                    c = g;
                    e = e + -1 | 0;
                }
                g = l;
            }
            return;
        }
        if ((f[a + 348 >> 2] | 0) <= 0)
            return;
        p = f[k >> 2] | 0;
        o = f[m >> 2] | 0;
        a = a + 4 | 0;
        c = 0;
        m = 0;
        e = 0;
        while (1) {
            if ((m | 0) >= (p | 0))
                break;
            n = f[o + (m * 12 | 0) + 4 >> 2] | 0;
            l = n - e | 0;
            g = (f[o + (m * 12 | 0) + 8 >> 2] | 0) == 0;
            a:
                do
                    if ((c | 0) == (e | 0) & g)
                        c = l + c | 0;
                    else {
                        if (g)
                            while (1) {
                                if ((e | 0) >= (n | 0))
                                    break a;
                                f[b + (c << 2) >> 2] = f[b + (e << 2) >> 2];
                                e = e + 1 | 0;
                                c = c + 1 | 0;
                            }
                        j = f[o + (m * 12 | 0) >> 2] | 0;
                        i = (j | 0) > -1;
                        j = j & 2147483647;
                        k = l + -1 + j | 0;
                        h = 0;
                        while (1) {
                            if ((h | 0) >= (l | 0))
                                break a;
                            e = i ? h + j | 0 : k - h | 0;
                            g = d[(f[a >> 2] | 0) + (e << 1) >> 1] | 0;
                            b:
                                do
                                    if ((g & -4) << 16 >> 16 != 8204) {
                                        switch (g << 16 >> 16) {
                                        case 8234:
                                        case 8235:
                                        case 8236:
                                        case 8237:
                                        case 8238:
                                        case 8294:
                                        case 8295:
                                        case 8296:
                                        case 8297:
                                            break b;
                                        default: {
                                            }
                                        }
                                        f[b + (c << 2) >> 2] = e;
                                        c = c + 1 | 0;
                                    }
                                while (0);
                            h = h + 1 | 0;
                        }
                    }
                while (0);
            m = m + 1 | 0;
            e = n;
        }
        return;
    }
    function Kb(a) {
        a = a | 0;
        return (a | 0) < 1 | 0;
    }
    function Lb(a, b, c, e, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        g = g | 0;
        var h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0;
        o = u;
        u = u + 656 | 0;
        j = o + 32 | 0;
        l = o + 56 | 0;
        m = o + 28 | 0;
        n = o + 24 | 0;
        k = o;
        if (!g) {
            n = 0;
            u = o;
            return n | 0;
        }
        if ((Mb(f[g >> 2] | 0) | 0) << 24 >> 24) {
            n = 0;
            u = o;
            return n | 0;
        }
        if (!((a | 0) == 0 | (b | 0) < -1) ? (h = (c | 0) == 0, !((e | 0) < 0 | h & (e | 0) != 0)) : 0) {
            if ((b | 0) == -1)
                b = bc(a) | 0;
            if ((b | 0) < 1) {
                dc(c, e, 0, g) | 0;
                n = 0;
                u = o;
                return n | 0;
            }
            do
                if (!h) {
                    if (!(a >>> 0 <= c >>> 0 & (a + (b << 1) | 0) >>> 0 > c >>> 0) ? !(c >>> 0 <= a >>> 0 & (c + (e << 1) | 0) >>> 0 > a >>> 0) : 0)
                        break;
                    f[g >> 2] = 1;
                    n = 0;
                    u = o;
                    return n | 0;
                }
            while (0);
            f[m >> 2] = 0;
            f[n >> 2] = 0;
            h = Ob(a, b) | 0;
            if ((h | 0) > (e | 0)) {
                f[g >> 2] = 15;
                n = h;
                u = o;
                return n | 0;
            }
            h = (b | 0) > (h | 0) ? b : h;
            if ((h | 0) >= 301) {
                i = _b(h << 1) | 0;
                if (!i) {
                    f[g >> 2] = 7;
                    n = 0;
                    u = o;
                    return n | 0;
                }
            } else {
                i = l;
                h = 300;
            }
            cc(i, a, b) | 0;
            if ((h | 0) > (b | 0))
                Vc(i + (b << 1) | 0, 0, h - b << 1 | 0) | 0;
            Pb(i, b, m, n);
            Qb(i, b, f[m >> 2] | 0, f[n >> 2] | 0);
            d[k >> 1] = 8203;
            d[k + 2 >> 1] = 0;
            f[k + 4 >> 2] = 3;
            f[k + 8 >> 2] = 2;
            f[k + 12 >> 2] = 262144;
            f[k + 16 >> 2] = 393216;
            f[k + 20 >> 2] = 0;
            f[j >> 2] = f[k >> 2];
            f[j + 4 >> 2] = f[k + 4 >> 2];
            f[j + 8 >> 2] = f[k + 8 >> 2];
            f[j + 12 >> 2] = f[k + 12 >> 2];
            f[j + 16 >> 2] = f[k + 16 >> 2];
            f[j + 20 >> 2] = f[k + 20 >> 2];
            b = Rb(i, b, g, j) | 0;
            Pb(i, b, m, n);
            Qb(i, b, f[m >> 2] | 0, f[n >> 2] | 0);
            cc(c, i, Zb(b, e) | 0) | 0;
            if ((i | 0) != (l | 0))
                ac(i);
            if ((b | 0) > (e | 0)) {
                f[g >> 2] = 15;
                n = b;
                u = o;
                return n | 0;
            } else {
                n = dc(c, e, b, g) | 0;
                u = o;
                return n | 0;
            }
        }
        f[g >> 2] = 1;
        n = 0;
        u = o;
        return n | 0;
    }
    function Mb(a) {
        a = a | 0;
        return (a | 0) > 0 | 0;
    }
    function Nb(a) {
        a = a | 0;
        var b = 0;
        b = a & 65535;
        if ((a + -1570 & 65535) < 178) {
            b = d[1122 + (b + -1570 << 1) >> 1] | 0;
            return b | 0;
        }
        if (a << 16 >> 16 == 8205) {
            b = 3;
            return b | 0;
        }
        if ((a + -8301 & 65535) < 3) {
            b = 4;
            return b | 0;
        }
        if ((a + 1200 & 65535) < 275) {
            b = h[69613 + (b + -64336) >> 0] | 0;
            return b | 0;
        }
        if ((a + 400 & 65535) >= 141) {
            b = 0;
            return b | 0;
        }
        b = h[69888 + (b + -65136) >> 0] | 0;
        return b | 0;
    }
    function Ob(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, e = 0, f = 0, g = 0, h = 0;
        g = b + -1 | 0;
        f = 0;
        c = b;
        while (1) {
            if ((f | 0) >= (b | 0))
                break;
            e = d[a + (f << 1) >> 1] | 0;
            if ((f | 0) < (g | 0) & e << 16 >> 16 == 1604 ? (Xb(d[a + (f + 1 << 1) >> 1] | 0) | 0) != 0 : 0)
                h = 6;
            else if (Yb(e) | 0)
                h = 6;
            if ((h | 0) == 6) {
                h = 0;
                c = c + -1 | 0;
            }
            f = f + 1 | 0;
        }
        return c | 0;
    }
    function Pb(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        var g = 0, h = 0;
        h = 0;
        while (1) {
            g = (h | 0) < (b | 0);
            if (g & (d[a + (h << 1) >> 1] | 0) == 32)
                h = h + 1 | 0;
            else
                break;
        }
        if (!g) {
            a = 0;
            f[c >> 2] = h;
            f[e >> 2] = a;
            return;
        }
        g = 0;
        while (1) {
            b = b + -1 | 0;
            if ((d[a + (b << 1) >> 1] | 0) != 32)
                break;
            else
                g = g + 1 | 0;
        }
        f[c >> 2] = h;
        f[e >> 2] = g;
        return;
    }
    function Qb(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        var f = 0, g = 0;
        b = b - e | 0;
        while (1) {
            b = b + -1 | 0;
            if ((c | 0) >= (b | 0))
                break;
            g = a + (c << 1) | 0;
            f = d[g >> 1] | 0;
            e = a + (b << 1) | 0;
            d[g >> 1] = d[e >> 1] | 0;
            d[e >> 1] = f;
            c = c + 1 | 0;
        }
        return;
    }
    function Rb(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        var g = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0, v = 0, w = 0, x = 0, y = 0, z = 0, A = 0;
        A = u;
        u = u + 32 | 0;
        y = A;
        j = 0;
        while (1) {
            if ((j | 0) >= (b | 0))
                break;
            k = a + (j << 1) | 0;
            g = d[k >> 1] | 0;
            i = g & 65535;
            if ((g + 1200 & 65535) < 176) {
                g = d[488 + (i + -64336 << 1) >> 1] | 0;
                if (g << 16 >> 16)
                    d[k >> 1] = g;
            } else if ((g + 400 & 65535) < 141)
                d[k >> 1] = d[840 + (i + -65136 << 1) >> 1] | 0;
            j = j + 1 | 0;
        }
        l = b + -1 | 0;
        x = l;
        j = 0;
        g = Nb(d[a + (l << 1) >> 1] | 0) | 0;
        m = 0;
        w = 0;
        r = 0;
        s = 0;
        p = 0;
        k = -2;
        while (1) {
            if ((l | 0) == -1)
                break;
            o = g & 65535;
            if (!((o & 65280 | 0) == 0 ? ((Nb(d[a + (l << 1) >> 1] | 0) | 0) & 4) == 0 : 0))
                z = 13;
            do
                if ((z | 0) == 13) {
                    z = 0;
                    n = l + -1 | 0;
                    while (1) {
                        if ((k | 0) >= 0)
                            break;
                        if ((n | 0) == -1) {
                            i = -1;
                            j = 0;
                            k = 3000;
                        } else {
                            j = Nb(d[a + (n << 1) >> 1] | 0) | 0;
                            v = (j & 4) == 0;
                            i = n + ((v ^ 1) << 31 >> 31) | 0;
                            k = v ? n : k;
                        }
                        n = i;
                    }
                    do
                        if (!((m & 16) == 0 | (o & 32 | 0) == 0)) {
                            g = a + (l << 1) | 0;
                            i = Tb(d[g >> 1] | 0) | 0;
                            if (!(i << 16 >> 16)) {
                                g = Nb(0) | 0;
                                t = w;
                                v = 1;
                                break;
                            } else {
                                d[g >> 1] = -1;
                                d[a + (x << 1) >> 1] = i;
                                g = Nb(i) | 0;
                                t = w;
                                v = 1;
                                l = x;
                                break;
                            }
                        } else {
                            t = m;
                            v = p;
                        }
                    while (0);
                    if ((l | 0) > 0) {
                        if ((d[a + (l + -1 << 1) >> 1] | 0) == 32) {
                            p = d[a + (l << 1) >> 1] | 0;
                            q = (Ub(p) | 0) == 0;
                            r = p << 16 >> 16 == 1574 & q ? 1 : r;
                            s = q ? s : 1;
                        }
                    } else if (!l) {
                        p = d[a >> 1] | 0;
                        q = (Ub(p) | 0) == 0;
                        r = p << 16 >> 16 == 1574 & q ? 1 : r;
                        s = q ? s : 1;
                    }
                    n = j & 65535;
                    o = t & 65535;
                    q = g & 65535;
                    m = q & 3;
                    p = h[69541 + ((n & 3) << 4) + ((o & 3) << 2) + m >> 0] | 0;
                    if ((m | 0) != 1) {
                        m = a + (l << 1) | 0;
                        i = d[m >> 1] | 0;
                        if (Vb(i) | 0)
                            if ((o & 2 | 0) == 0 | (n & 1 | 0) == 0 | (i & -2) << 16 >> 16 == 1612)
                                p = 0;
                            else
                                p = o >>> 4 & 1 ^ 1 | n >>> 5 & 1 ^ 1;
                    } else {
                        i = a + (l << 1) | 0;
                        p = p & 1;
                        m = i;
                        i = d[i >> 1] | 0;
                    }
                    if (((i ^ 1536) & 65535) < 256) {
                        if (Vb(i) | 0) {
                            d[m >> 1] = p + 65136 + (h[69605 + ((i & 65535) + -1611) >> 0] | 0);
                            m = t;
                            p = v;
                            break;
                        }
                        i = q >>> 8;
                        if (q & 8 | 0) {
                            d[m >> 1] = p + i + 64336;
                            m = t;
                            p = v;
                            break;
                        }
                        if ((i | 0) != 0 & (q & 4 | 0) == 0) {
                            d[m >> 1] = p + i + 65136;
                            m = t;
                            p = v;
                        } else {
                            m = t;
                            p = v;
                        }
                    } else {
                        m = t;
                        p = v;
                    }
                }
            while (0);
            i = (g & 4) == 0;
            n = i ? m : w;
            m = i ? g : m;
            i = i ? l : x;
            o = l + -1 | 0;
            if ((o | 0) != (k | 0)) {
                if (l)
                    g = Nb(d[a + (o << 1) >> 1] | 0) | 0;
            } else {
                g = j;
                k = -2;
            }
            x = i;
            w = n;
            l = o;
        }
        if (p) {
            f[y >> 2] = f[e >> 2];
            f[y + 4 >> 2] = f[e + 4 >> 2];
            f[y + 8 >> 2] = f[e + 8 >> 2];
            f[y + 12 >> 2] = f[e + 12 >> 2];
            f[y + 16 >> 2] = f[e + 16 >> 2];
            f[y + 20 >> 2] = f[e + 20 >> 2];
            b = Wb(a, b, c, y) | 0;
        }
        if (!(r | s)) {
            z = b;
            u = A;
            return z | 0;
        }
        z = Sb(b) | 0;
        u = A;
        return z | 0;
    }
    function Sb(a) {
        a = a | 0;
        return a | 0;
    }
    function Tb(a) {
        a = a | 0;
        switch (a << 16 >> 16) {
        case 1570: {
                a = 1628;
                break;
            }
        case 1571: {
                a = 1629;
                break;
            }
        case 1573: {
                a = 1630;
                break;
            }
        case 1575: {
                a = 1631;
                break;
            }
        default:
            a = 0;
        }
        return a | 0;
    }
    function Ub(a) {
        a = a | 0;
        return (a + -1587 & 65535) < 4 | 0;
    }
    function Vb(a) {
        a = a | 0;
        return (a + -1611 & 65535) < 8 | 0;
    }
    function Wb(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        var g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0;
        m = (b << 1) + 2 | 0;
        n = _b(m) | 0;
        if (!n) {
            f[c >> 2] = 7;
            n = 0;
            return n | 0;
        }
        Vc(n | 0, 0, m | 0) | 0;
        c = 0;
        h = 0;
        g = 0;
        while (1) {
            if ((g | 0) >= (b | 0))
                break;
            i = d[a + (g << 1) >> 1] | 0;
            if (i << 16 >> 16 == -1) {
                c = c + 1 | 0;
                h = h + -1 | 0;
            } else
                d[n + (h << 1) >> 1] = i;
            h = h + 1 | 0;
            g = g + 1 | 0;
        }
        while (1) {
            if ((c | 0) <= -1)
                break;
            d[n + (g << 1) >> 1] = 0;
            g = g + -1 | 0;
            c = c + -1 | 0;
        }
        cc(a, n, b) | 0;
        if (f[e + 4 >> 2] | 0) {
            c = bc(a) | 0;
            if (!(f[e + 12 >> 2] | 0)) {
                j = 0;
                k = 1;
                l = 15;
            }
        } else {
            j = 1;
            k = (f[e + 12 >> 2] | 0) == 0;
            l = 15;
        }
        if ((l | 0) == 15) {
            Vc(n | 0, 0, m | 0) | 0;
            c = b;
            g = 0;
            i = b;
            while (1) {
                if ((i | 0) <= -1)
                    break;
                h = d[a + (i << 1) >> 1] | 0;
                if (j & h << 16 >> 16 == -1 | k & h << 16 >> 16 == -2) {
                    c = c + 1 | 0;
                    g = g + 1 | 0;
                } else
                    d[n + (c << 1) >> 1] = h;
                c = c + -1 | 0;
                i = i + -1 | 0;
            }
            c = 0;
            while (1) {
                if ((c | 0) >= (g | 0))
                    break;
                d[n + (c << 1) >> 1] = 32;
                c = c + 1 | 0;
            }
            cc(a, n, b) | 0;
            c = b;
        }
        k = (f[e + 8 >> 2] | 0) == 0;
        e = (f[e + 16 >> 2] | 0) == 0;
        j = e | k ^ 1;
        if (k | e) {
            Vc(n | 0, 0, m | 0) | 0;
            h = 0;
            c = 0;
            g = 0;
            while (1) {
                if ((g | 0) >= (b | 0))
                    break;
                i = d[a + (g << 1) >> 1] | 0;
                if (k & i << 16 >> 16 == -1 | j & i << 16 >> 16 == -2) {
                    h = h + -1 | 0;
                    c = c + 1 | 0;
                } else
                    d[n + (h << 1) >> 1] = i;
                h = h + 1 | 0;
                g = g + 1 | 0;
            }
            while (1) {
                if ((c | 0) <= -1)
                    break;
                d[n + (g << 1) >> 1] = 32;
                g = g + -1 | 0;
                c = c + -1 | 0;
            }
            cc(a, n, b) | 0;
            c = b;
        }
        ac(n);
        n = c;
        return n | 0;
    }
    function Xb(a) {
        a = a | 0;
        switch (a << 16 >> 16) {
        case 1573:
        case 1571:
        case 1570: {
                a = 1;
                break;
            }
        default:
            a = a << 16 >> 16 == 1575 & 1;
        }
        return a | 0;
    }
    function Yb(a) {
        a = a | 0;
        return (a & -16) << 16 >> 16 == -400 | 0;
    }
    function Zb(a, b) {
        a = a | 0;
        b = b | 0;
        return ((a | 0) > (b | 0) ? b : a) | 0;
    }
    function _b(a) {
        a = a | 0;
        if (!a)
            a = 70232;
        else
            a = nc(a) | 0;
        return a | 0;
    }
    function $b(a, b) {
        a = a | 0;
        b = b | 0;
        do
            if ((a | 0) != 70232)
                if (!b) {
                    oc(a);
                    a = 70232;
                    break;
                } else {
                    a = pc(a, b) | 0;
                    break;
                }
            else
                a = _b(b) | 0;
        while (0);
        return a | 0;
    }
    function ac(a) {
        a = a | 0;
        if ((a | 0) == 70232)
            return;
        oc(a);
        return;
    }
    function bc(a) {
        a = a | 0;
        var b = 0;
        b = a;
        while (1)
            if (!(d[b >> 1] | 0))
                break;
            else
                b = b + 2 | 0;
        return b - a >> 1 | 0;
    }
    function cc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        if ((c | 0) <= 0)
            return a | 0;
        Uc(a | 0, b | 0, c << 1 | 0) | 0;
        return a | 0;
    }
    function dc(a, b, c, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        e = e | 0;
        do
            if (e | 0 ? !((c | 0) < 0 | (ec(f[e >> 2] | 0) | 0) << 24 >> 24 == 0) : 0) {
                if ((c | 0) < (b | 0)) {
                    d[a + (c << 1) >> 1] = 0;
                    if ((f[e >> 2] | 0) != -124)
                        break;
                    f[e >> 2] = 0;
                    break;
                }
                if ((c | 0) == (b | 0)) {
                    f[e >> 2] = -124;
                    break;
                } else {
                    f[e >> 2] = 15;
                    break;
                }
            }
        while (0);
        return c | 0;
    }
    function ec(a) {
        a = a | 0;
        return (a | 0) < 1 | 0;
    }
    function fc(a) {
        a = a | 0;
        var b = 0;
        do
            if (a >>> 0 >= 55296) {
                if (a >>> 0 < 65536) {
                    b = ((a | 0) < 56320 ? 320 : 0) + (a >>> 5) | 0;
                    break;
                }
                if (a >>> 0 > 1114111) {
                    a = 4596;
                    a = 1478 + (a << 1) | 0;
                    a = d[a >> 1] | 0;
                    a = a & 255;
                    a = a & 31;
                    return a | 0;
                } else {
                    b = (a >>> 5 & 63) + (j[1478 + ((a >>> 11) + 2080 << 1) >> 1] | 0) | 0;
                    break;
                }
            } else
                b = a >>> 5;
        while (0);
        a = ((j[1478 + (b << 1) >> 1] | 0) << 2) + (a & 31) | 0;
        a = 1478 + (a << 1) | 0;
        a = d[a >> 1] | 0;
        a = a & 255;
        a = a & 31;
        return a | 0;
    }
    function gc(a) {
        a = a | 0;
        var b = 0;
        do
            if (a >>> 0 >= 55296) {
                if (a >>> 0 < 65536) {
                    b = ((a | 0) < 56320 ? 320 : 0) + (a >>> 5) | 0;
                    break;
                }
                if (a >>> 0 > 1114111) {
                    a = 3644;
                    a = 44382 + (a << 1) | 0;
                    a = d[a >> 1] | 0;
                    a = a & 31;
                    a = a & 65535;
                    return a | 0;
                } else {
                    b = (a >>> 5 & 63) + (j[44382 + ((a >>> 11) + 2080 << 1) >> 1] | 0) | 0;
                    break;
                }
            } else
                b = a >>> 5;
        while (0);
        a = ((j[44382 + (b << 1) >> 1] | 0) << 2) + (a & 31) | 0;
        a = 44382 + (a << 1) | 0;
        a = d[a >> 1] | 0;
        a = a & 31;
        a = a & 65535;
        return a | 0;
    }
    function hc(a) {
        a = a | 0;
        var b = 0;
        do
            if (a >>> 0 >= 55296) {
                if (a >>> 0 < 65536) {
                    b = ((a | 0) < 56320 ? 320 : 0) + (a >>> 5) | 0;
                    break;
                }
                if (a >>> 0 > 1114111) {
                    b = 3644;
                    b = 44382 + (b << 1) | 0;
                    b = d[b >> 1] | 0;
                    a = ic(a, b) | 0;
                    return a | 0;
                } else {
                    b = (a >>> 5 & 63) + (j[44382 + ((a >>> 11) + 2080 << 1) >> 1] | 0) | 0;
                    break;
                }
            } else
                b = a >>> 5;
        while (0);
        b = ((j[44382 + (b << 1) >> 1] | 0) << 2) + (a & 31) | 0;
        b = 44382 + (b << 1) | 0;
        b = d[b >> 1] | 0;
        a = ic(a, b) | 0;
        return a | 0;
    }
    function ic(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0;
        b = b << 16 >> 16 >> 13;
        if ((b | 0) != -4) {
            d = b + a | 0;
            return d | 0;
        }
        b = 0;
        while (1) {
            if (b >>> 0 >= 40) {
                b = 8;
                break;
            }
            d = f[248 + (b << 2) >> 2] | 0;
            c = d & 2097151;
            if ((c | 0) == (a | 0)) {
                b = 6;
                break;
            }
            if ((c | 0) > (a | 0)) {
                b = 8;
                break;
            } else
                b = b + 1 | 0;
        }
        if ((b | 0) == 6) {
            d = f[248 + (d >>> 21 << 2) >> 2] & 2097151;
            return d | 0;
        } else if ((b | 0) == 8)
            return a | 0;
        return 0;
    }
    function jc(a) {
        a = a | 0;
        var b = 0, c = 0;
        do
            if (a >>> 0 >= 55296) {
                if (a >>> 0 < 65536) {
                    b = ((a | 0) < 56320 ? 320 : 0) + (a >>> 5) | 0;
                    c = 7;
                    break;
                }
                if (a >>> 0 > 1114111)
                    b = 3644;
                else {
                    b = (a >>> 5 & 63) + (j[44382 + ((a >>> 11) + 2080 << 1) >> 1] | 0) | 0;
                    c = 7;
                }
            } else {
                b = a >>> 5;
                c = 7;
            }
        while (0);
        if ((c | 0) == 7)
            b = ((j[44382 + (b << 1) >> 1] | 0) << 2) + (a & 31) | 0;
        return (d[44382 + (b << 1) >> 1] & 768) >>> 8 | 0;
    }
    function kc(a) {
        a = a | 0;
        var b = 0, c = 0;
        do
            if (a >>> 0 >= 55296) {
                if (a >>> 0 < 65536) {
                    b = ((a | 0) < 56320 ? 320 : 0) + (a >>> 5) | 0;
                    c = 7;
                    break;
                }
                if (a >>> 0 > 1114111)
                    b = 3644;
                else {
                    b = (a >>> 5 & 63) + (j[44382 + ((a >>> 11) + 2080 << 1) >> 1] | 0) | 0;
                    c = 7;
                }
            } else {
                b = a >>> 5;
                c = 7;
            }
        while (0);
        if ((c | 0) == 7)
            b = ((j[44382 + (b << 1) >> 1] | 0) << 2) + (a & 31) | 0;
        b = d[44382 + (b << 1) >> 1] | 0;
        if (!(b & 768))
            return a | 0;
        a = ic(a, b) | 0;
        return a | 0;
    }
    function lc(a) {
        a = a | 0;
        return hc(a) | 0;
    }
    function mc(a) {
        a = a | 0;
        return kc(a) | 0;
    }
    function nc(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0, r = 0, s = 0, t = 0;
        t = u;
        u = u + 16 | 0;
        n = t;
        do
            if (a >>> 0 < 245) {
                k = a >>> 0 < 11 ? 16 : a + 11 & -8;
                a = k >>> 3;
                m = f[17564] | 0;
                c = m >>> a;
                if (c & 3 | 0) {
                    b = (c & 1 ^ 1) + a | 0;
                    a = 70296 + (b << 1 << 2) | 0;
                    c = a + 8 | 0;
                    d = f[c >> 2] | 0;
                    e = d + 8 | 0;
                    g = f[e >> 2] | 0;
                    if ((g | 0) == (a | 0))
                        f[17564] = m & ~(1 << b);
                    else {
                        f[g + 12 >> 2] = a;
                        f[c >> 2] = g;
                    }
                    s = b << 3;
                    f[d + 4 >> 2] = s | 3;
                    s = d + s + 4 | 0;
                    f[s >> 2] = f[s >> 2] | 1;
                    s = e;
                    u = t;
                    return s | 0;
                }
                l = f[17566] | 0;
                if (k >>> 0 > l >>> 0) {
                    if (c | 0) {
                        b = 2 << a;
                        b = c << a & (b | 0 - b);
                        b = (b & 0 - b) + -1 | 0;
                        i = b >>> 12 & 16;
                        b = b >>> i;
                        c = b >>> 5 & 8;
                        b = b >>> c;
                        g = b >>> 2 & 4;
                        b = b >>> g;
                        a = b >>> 1 & 2;
                        b = b >>> a;
                        d = b >>> 1 & 1;
                        d = (c | i | g | a | d) + (b >>> d) | 0;
                        b = 70296 + (d << 1 << 2) | 0;
                        a = b + 8 | 0;
                        g = f[a >> 2] | 0;
                        i = g + 8 | 0;
                        c = f[i >> 2] | 0;
                        if ((c | 0) == (b | 0)) {
                            a = m & ~(1 << d);
                            f[17564] = a;
                        } else {
                            f[c + 12 >> 2] = b;
                            f[a >> 2] = c;
                            a = m;
                        }
                        s = d << 3;
                        h = s - k | 0;
                        f[g + 4 >> 2] = k | 3;
                        e = g + k | 0;
                        f[e + 4 >> 2] = h | 1;
                        f[g + s >> 2] = h;
                        if (l | 0) {
                            d = f[17569] | 0;
                            b = l >>> 3;
                            c = 70296 + (b << 1 << 2) | 0;
                            b = 1 << b;
                            if (!(a & b)) {
                                f[17564] = a | b;
                                b = c;
                                a = c + 8 | 0;
                            } else {
                                a = c + 8 | 0;
                                b = f[a >> 2] | 0;
                            }
                            f[a >> 2] = d;
                            f[b + 12 >> 2] = d;
                            f[d + 8 >> 2] = b;
                            f[d + 12 >> 2] = c;
                        }
                        f[17566] = h;
                        f[17569] = e;
                        s = i;
                        u = t;
                        return s | 0;
                    }
                    g = f[17565] | 0;
                    if (g) {
                        c = (g & 0 - g) + -1 | 0;
                        e = c >>> 12 & 16;
                        c = c >>> e;
                        d = c >>> 5 & 8;
                        c = c >>> d;
                        h = c >>> 2 & 4;
                        c = c >>> h;
                        i = c >>> 1 & 2;
                        c = c >>> i;
                        j = c >>> 1 & 1;
                        j = f[70560 + ((d | e | h | i | j) + (c >>> j) << 2) >> 2] | 0;
                        c = j;
                        i = j;
                        j = (f[j + 4 >> 2] & -8) - k | 0;
                        while (1) {
                            a = f[c + 16 >> 2] | 0;
                            if (!a) {
                                a = f[c + 20 >> 2] | 0;
                                if (!a)
                                    break;
                            }
                            h = (f[a + 4 >> 2] & -8) - k | 0;
                            e = h >>> 0 < j >>> 0;
                            c = a;
                            i = e ? a : i;
                            j = e ? h : j;
                        }
                        h = i + k | 0;
                        if (h >>> 0 > i >>> 0) {
                            e = f[i + 24 >> 2] | 0;
                            b = f[i + 12 >> 2] | 0;
                            do
                                if ((b | 0) == (i | 0)) {
                                    a = i + 20 | 0;
                                    b = f[a >> 2] | 0;
                                    if (!b) {
                                        a = i + 16 | 0;
                                        b = f[a >> 2] | 0;
                                        if (!b) {
                                            c = 0;
                                            break;
                                        }
                                    }
                                    while (1) {
                                        d = b + 20 | 0;
                                        c = f[d >> 2] | 0;
                                        if (!c) {
                                            d = b + 16 | 0;
                                            c = f[d >> 2] | 0;
                                            if (!c)
                                                break;
                                            else {
                                                b = c;
                                                a = d;
                                            }
                                        } else {
                                            b = c;
                                            a = d;
                                        }
                                    }
                                    f[a >> 2] = 0;
                                    c = b;
                                } else {
                                    c = f[i + 8 >> 2] | 0;
                                    f[c + 12 >> 2] = b;
                                    f[b + 8 >> 2] = c;
                                    c = b;
                                }
                            while (0);
                            do
                                if (e | 0) {
                                    b = f[i + 28 >> 2] | 0;
                                    a = 70560 + (b << 2) | 0;
                                    if ((i | 0) == (f[a >> 2] | 0)) {
                                        f[a >> 2] = c;
                                        if (!c) {
                                            f[17565] = g & ~(1 << b);
                                            break;
                                        }
                                    } else {
                                        s = e + 16 | 0;
                                        f[((f[s >> 2] | 0) == (i | 0) ? s : e + 20 | 0) >> 2] = c;
                                        if (!c)
                                            break;
                                    }
                                    f[c + 24 >> 2] = e;
                                    b = f[i + 16 >> 2] | 0;
                                    if (b | 0) {
                                        f[c + 16 >> 2] = b;
                                        f[b + 24 >> 2] = c;
                                    }
                                    b = f[i + 20 >> 2] | 0;
                                    if (b | 0) {
                                        f[c + 20 >> 2] = b;
                                        f[b + 24 >> 2] = c;
                                    }
                                }
                            while (0);
                            if (j >>> 0 < 16) {
                                s = j + k | 0;
                                f[i + 4 >> 2] = s | 3;
                                s = i + s + 4 | 0;
                                f[s >> 2] = f[s >> 2] | 1;
                            } else {
                                f[i + 4 >> 2] = k | 3;
                                f[h + 4 >> 2] = j | 1;
                                f[h + j >> 2] = j;
                                if (l | 0) {
                                    d = f[17569] | 0;
                                    b = l >>> 3;
                                    c = 70296 + (b << 1 << 2) | 0;
                                    b = 1 << b;
                                    if (!(b & m)) {
                                        f[17564] = b | m;
                                        b = c;
                                        a = c + 8 | 0;
                                    } else {
                                        a = c + 8 | 0;
                                        b = f[a >> 2] | 0;
                                    }
                                    f[a >> 2] = d;
                                    f[b + 12 >> 2] = d;
                                    f[d + 8 >> 2] = b;
                                    f[d + 12 >> 2] = c;
                                }
                                f[17566] = j;
                                f[17569] = h;
                            }
                            s = i + 8 | 0;
                            u = t;
                            return s | 0;
                        } else
                            m = k;
                    } else
                        m = k;
                } else
                    m = k;
            } else if (a >>> 0 <= 4294967231) {
                a = a + 11 | 0;
                k = a & -8;
                d = f[17565] | 0;
                if (d) {
                    e = 0 - k | 0;
                    a = a >>> 8;
                    if (a)
                        if (k >>> 0 > 16777215)
                            j = 31;
                        else {
                            m = (a + 1048320 | 0) >>> 16 & 8;
                            r = a << m;
                            i = (r + 520192 | 0) >>> 16 & 4;
                            r = r << i;
                            j = (r + 245760 | 0) >>> 16 & 2;
                            j = 14 - (i | m | j) + (r << j >>> 15) | 0;
                            j = k >>> (j + 7 | 0) & 1 | j << 1;
                        }
                    else
                        j = 0;
                    c = f[70560 + (j << 2) >> 2] | 0;
                    a:
                        do
                            if (!c) {
                                c = 0;
                                a = 0;
                                r = 61;
                            } else {
                                a = 0;
                                i = k << ((j | 0) == 31 ? 0 : 25 - (j >>> 1) | 0);
                                g = 0;
                                while (1) {
                                    h = (f[c + 4 >> 2] & -8) - k | 0;
                                    if (h >>> 0 < e >>> 0)
                                        if (!h) {
                                            a = c;
                                            e = 0;
                                            r = 65;
                                            break a;
                                        } else {
                                            a = c;
                                            e = h;
                                        }
                                    r = f[c + 20 >> 2] | 0;
                                    c = f[c + 16 + (i >>> 31 << 2) >> 2] | 0;
                                    g = (r | 0) == 0 | (r | 0) == (c | 0) ? g : r;
                                    if (!c) {
                                        c = g;
                                        r = 61;
                                        break;
                                    } else
                                        i = i << 1;
                                }
                            }
                        while (0);
                    if ((r | 0) == 61) {
                        if ((c | 0) == 0 & (a | 0) == 0) {
                            a = 2 << j;
                            a = (a | 0 - a) & d;
                            if (!a) {
                                m = k;
                                break;
                            }
                            m = (a & 0 - a) + -1 | 0;
                            h = m >>> 12 & 16;
                            m = m >>> h;
                            g = m >>> 5 & 8;
                            m = m >>> g;
                            i = m >>> 2 & 4;
                            m = m >>> i;
                            j = m >>> 1 & 2;
                            m = m >>> j;
                            c = m >>> 1 & 1;
                            a = 0;
                            c = f[70560 + ((g | h | i | j | c) + (m >>> c) << 2) >> 2] | 0;
                        }
                        if (!c) {
                            i = a;
                            h = e;
                        } else
                            r = 65;
                    }
                    if ((r | 0) == 65) {
                        g = c;
                        while (1) {
                            m = (f[g + 4 >> 2] & -8) - k | 0;
                            c = m >>> 0 < e >>> 0;
                            e = c ? m : e;
                            a = c ? g : a;
                            c = f[g + 16 >> 2] | 0;
                            if (!c)
                                c = f[g + 20 >> 2] | 0;
                            if (!c) {
                                i = a;
                                h = e;
                                break;
                            } else
                                g = c;
                        }
                    }
                    if (((i | 0) != 0 ? h >>> 0 < ((f[17566] | 0) - k | 0) >>> 0 : 0) ? (l = i + k | 0, l >>> 0 > i >>> 0) : 0) {
                        g = f[i + 24 >> 2] | 0;
                        b = f[i + 12 >> 2] | 0;
                        do
                            if ((b | 0) == (i | 0)) {
                                a = i + 20 | 0;
                                b = f[a >> 2] | 0;
                                if (!b) {
                                    a = i + 16 | 0;
                                    b = f[a >> 2] | 0;
                                    if (!b) {
                                        b = 0;
                                        break;
                                    }
                                }
                                while (1) {
                                    e = b + 20 | 0;
                                    c = f[e >> 2] | 0;
                                    if (!c) {
                                        e = b + 16 | 0;
                                        c = f[e >> 2] | 0;
                                        if (!c)
                                            break;
                                        else {
                                            b = c;
                                            a = e;
                                        }
                                    } else {
                                        b = c;
                                        a = e;
                                    }
                                }
                                f[a >> 2] = 0;
                            } else {
                                s = f[i + 8 >> 2] | 0;
                                f[s + 12 >> 2] = b;
                                f[b + 8 >> 2] = s;
                            }
                        while (0);
                        do
                            if (g) {
                                a = f[i + 28 >> 2] | 0;
                                c = 70560 + (a << 2) | 0;
                                if ((i | 0) == (f[c >> 2] | 0)) {
                                    f[c >> 2] = b;
                                    if (!b) {
                                        d = d & ~(1 << a);
                                        f[17565] = d;
                                        break;
                                    }
                                } else {
                                    s = g + 16 | 0;
                                    f[((f[s >> 2] | 0) == (i | 0) ? s : g + 20 | 0) >> 2] = b;
                                    if (!b)
                                        break;
                                }
                                f[b + 24 >> 2] = g;
                                a = f[i + 16 >> 2] | 0;
                                if (a | 0) {
                                    f[b + 16 >> 2] = a;
                                    f[a + 24 >> 2] = b;
                                }
                                a = f[i + 20 >> 2] | 0;
                                if (a) {
                                    f[b + 20 >> 2] = a;
                                    f[a + 24 >> 2] = b;
                                }
                            }
                        while (0);
                        b:
                            do
                                if (h >>> 0 < 16) {
                                    s = h + k | 0;
                                    f[i + 4 >> 2] = s | 3;
                                    s = i + s + 4 | 0;
                                    f[s >> 2] = f[s >> 2] | 1;
                                } else {
                                    f[i + 4 >> 2] = k | 3;
                                    f[l + 4 >> 2] = h | 1;
                                    f[l + h >> 2] = h;
                                    b = h >>> 3;
                                    if (h >>> 0 < 256) {
                                        c = 70296 + (b << 1 << 2) | 0;
                                        a = f[17564] | 0;
                                        b = 1 << b;
                                        if (!(a & b)) {
                                            f[17564] = a | b;
                                            b = c;
                                            a = c + 8 | 0;
                                        } else {
                                            a = c + 8 | 0;
                                            b = f[a >> 2] | 0;
                                        }
                                        f[a >> 2] = l;
                                        f[b + 12 >> 2] = l;
                                        f[l + 8 >> 2] = b;
                                        f[l + 12 >> 2] = c;
                                        break;
                                    }
                                    b = h >>> 8;
                                    if (b)
                                        if (h >>> 0 > 16777215)
                                            c = 31;
                                        else {
                                            r = (b + 1048320 | 0) >>> 16 & 8;
                                            s = b << r;
                                            q = (s + 520192 | 0) >>> 16 & 4;
                                            s = s << q;
                                            c = (s + 245760 | 0) >>> 16 & 2;
                                            c = 14 - (q | r | c) + (s << c >>> 15) | 0;
                                            c = h >>> (c + 7 | 0) & 1 | c << 1;
                                        }
                                    else
                                        c = 0;
                                    b = 70560 + (c << 2) | 0;
                                    f[l + 28 >> 2] = c;
                                    a = l + 16 | 0;
                                    f[a + 4 >> 2] = 0;
                                    f[a >> 2] = 0;
                                    a = 1 << c;
                                    if (!(a & d)) {
                                        f[17565] = a | d;
                                        f[b >> 2] = l;
                                        f[l + 24 >> 2] = b;
                                        f[l + 12 >> 2] = l;
                                        f[l + 8 >> 2] = l;
                                        break;
                                    }
                                    b = f[b >> 2] | 0;
                                    c:
                                        do
                                            if ((f[b + 4 >> 2] & -8 | 0) != (h | 0)) {
                                                d = h << ((c | 0) == 31 ? 0 : 25 - (c >>> 1) | 0);
                                                while (1) {
                                                    c = b + 16 + (d >>> 31 << 2) | 0;
                                                    a = f[c >> 2] | 0;
                                                    if (!a)
                                                        break;
                                                    if ((f[a + 4 >> 2] & -8 | 0) == (h | 0)) {
                                                        b = a;
                                                        break c;
                                                    } else {
                                                        d = d << 1;
                                                        b = a;
                                                    }
                                                }
                                                f[c >> 2] = l;
                                                f[l + 24 >> 2] = b;
                                                f[l + 12 >> 2] = l;
                                                f[l + 8 >> 2] = l;
                                                break b;
                                            }
                                        while (0);
                                    r = b + 8 | 0;
                                    s = f[r >> 2] | 0;
                                    f[s + 12 >> 2] = l;
                                    f[r >> 2] = l;
                                    f[l + 8 >> 2] = s;
                                    f[l + 12 >> 2] = b;
                                    f[l + 24 >> 2] = 0;
                                }
                            while (0);
                        s = i + 8 | 0;
                        u = t;
                        return s | 0;
                    } else
                        m = k;
                } else
                    m = k;
            } else
                m = -1;
        while (0);
        c = f[17566] | 0;
        if (c >>> 0 >= m >>> 0) {
            b = c - m | 0;
            a = f[17569] | 0;
            if (b >>> 0 > 15) {
                s = a + m | 0;
                f[17569] = s;
                f[17566] = b;
                f[s + 4 >> 2] = b | 1;
                f[a + c >> 2] = b;
                f[a + 4 >> 2] = m | 3;
            } else {
                f[17566] = 0;
                f[17569] = 0;
                f[a + 4 >> 2] = c | 3;
                s = a + c + 4 | 0;
                f[s >> 2] = f[s >> 2] | 1;
            }
            s = a + 8 | 0;
            u = t;
            return s | 0;
        }
        h = f[17567] | 0;
        if (h >>> 0 > m >>> 0) {
            q = h - m | 0;
            f[17567] = q;
            s = f[17570] | 0;
            r = s + m | 0;
            f[17570] = r;
            f[r + 4 >> 2] = q | 1;
            f[s + 4 >> 2] = m | 3;
            s = s + 8 | 0;
            u = t;
            return s | 0;
        }
        if (!(f[17682] | 0)) {
            f[17684] = 4096;
            f[17683] = 4096;
            f[17685] = -1;
            f[17686] = -1;
            f[17687] = 0;
            f[17675] = 0;
            f[17682] = n & -16 ^ 1431655768;
            a = 4096;
        } else
            a = f[17684] | 0;
        i = m + 48 | 0;
        j = m + 47 | 0;
        g = a + j | 0;
        e = 0 - a | 0;
        k = g & e;
        if (k >>> 0 <= m >>> 0) {
            s = 0;
            u = t;
            return s | 0;
        }
        a = f[17674] | 0;
        if (a | 0 ? (l = f[17672] | 0, n = l + k | 0, n >>> 0 <= l >>> 0 | n >>> 0 > a >>> 0) : 0) {
            s = 0;
            u = t;
            return s | 0;
        }
        d:
            do
                if (!(f[17675] & 4)) {
                    d = f[17570] | 0;
                    e:
                        do
                            if (d) {
                                a = 70704;
                                while (1) {
                                    c = f[a >> 2] | 0;
                                    if (c >>> 0 <= d >>> 0 ? (q = a + 4 | 0, (c + (f[q >> 2] | 0) | 0) >>> 0 > d >>> 0) : 0)
                                        break;
                                    a = f[a + 8 >> 2] | 0;
                                    if (!a) {
                                        r = 128;
                                        break e;
                                    }
                                }
                                b = g - h & e;
                                if (b >>> 0 < 2147483647) {
                                    d = Wc(b | 0) | 0;
                                    if ((d | 0) == ((f[a >> 2] | 0) + (f[q >> 2] | 0) | 0)) {
                                        if ((d | 0) != (-1 | 0))
                                            break d;
                                    } else
                                        r = 136;
                                } else
                                    b = 0;
                            } else
                                r = 128;
                        while (0);
                    do
                        if ((r | 0) == 128) {
                            a = Wc(0) | 0;
                            if ((a | 0) != (-1 | 0) ? (b = a, o = f[17683] | 0, p = o + -1 | 0, b = ((p & b | 0) == 0 ? 0 : (p + b & 0 - o) - b | 0) + k | 0, o = f[17672] | 0, p = b + o | 0, b >>> 0 > m >>> 0 & b >>> 0 < 2147483647) : 0) {
                                q = f[17674] | 0;
                                if (q | 0 ? p >>> 0 <= o >>> 0 | p >>> 0 > q >>> 0 : 0) {
                                    b = 0;
                                    break;
                                }
                                d = Wc(b | 0) | 0;
                                if ((d | 0) == (a | 0)) {
                                    d = a;
                                    break d;
                                } else
                                    r = 136;
                            } else
                                b = 0;
                        }
                    while (0);
                    do
                        if ((r | 0) == 136) {
                            c = 0 - b | 0;
                            if (!(i >>> 0 > b >>> 0 & (b >>> 0 < 2147483647 & (d | 0) != (-1 | 0))))
                                if ((d | 0) == (-1 | 0)) {
                                    b = 0;
                                    break;
                                } else
                                    break d;
                            a = f[17684] | 0;
                            a = j - b + a & 0 - a;
                            if (a >>> 0 >= 2147483647)
                                break d;
                            if ((Wc(a | 0) | 0) == (-1 | 0)) {
                                Wc(c | 0) | 0;
                                b = 0;
                                break;
                            } else {
                                b = a + b | 0;
                                break d;
                            }
                        }
                    while (0);
                    f[17675] = f[17675] | 4;
                    r = 143;
                } else {
                    b = 0;
                    r = 143;
                }
            while (0);
        if ((r | 0) == 143) {
            if (k >>> 0 >= 2147483647) {
                s = 0;
                u = t;
                return s | 0;
            }
            d = Wc(k | 0) | 0;
            q = Wc(0) | 0;
            a = q - d | 0;
            c = a >>> 0 > (m + 40 | 0) >>> 0;
            if ((d | 0) == (-1 | 0) | c ^ 1 | d >>> 0 < q >>> 0 & ((d | 0) != (-1 | 0) & (q | 0) != (-1 | 0)) ^ 1) {
                s = 0;
                u = t;
                return s | 0;
            } else
                b = c ? a : b;
        }
        a = (f[17672] | 0) + b | 0;
        f[17672] = a;
        if (a >>> 0 > (f[17673] | 0) >>> 0)
            f[17673] = a;
        j = f[17570] | 0;
        f:
            do
                if (j) {
                    a = 70704;
                    while (1) {
                        c = f[a >> 2] | 0;
                        e = a + 4 | 0;
                        g = f[e >> 2] | 0;
                        if ((d | 0) == (c + g | 0)) {
                            r = 154;
                            break;
                        }
                        h = f[a + 8 >> 2] | 0;
                        if (!h)
                            break;
                        else
                            a = h;
                    }
                    if (((r | 0) == 154 ? (f[a + 12 >> 2] & 8 | 0) == 0 : 0) ? d >>> 0 > j >>> 0 & c >>> 0 <= j >>> 0 : 0) {
                        f[e >> 2] = g + b;
                        s = (f[17567] | 0) + b | 0;
                        q = j + 8 | 0;
                        q = (q & 7 | 0) == 0 ? 0 : 0 - q & 7;
                        r = j + q | 0;
                        q = s - q | 0;
                        f[17570] = r;
                        f[17567] = q;
                        f[r + 4 >> 2] = q | 1;
                        f[j + s + 4 >> 2] = 40;
                        f[17571] = f[17686];
                        break;
                    }
                    if (d >>> 0 < (f[17568] | 0) >>> 0)
                        f[17568] = d;
                    e = d + b | 0;
                    a = 70704;
                    while (1) {
                        if ((f[a >> 2] | 0) == (e | 0)) {
                            r = 162;
                            break;
                        }
                        c = f[a + 8 >> 2] | 0;
                        if (!c)
                            break;
                        else
                            a = c;
                    }
                    if ((r | 0) == 162 ? (f[a + 12 >> 2] & 8 | 0) == 0 : 0) {
                        f[a >> 2] = d;
                        l = a + 4 | 0;
                        f[l >> 2] = (f[l >> 2] | 0) + b;
                        l = d + 8 | 0;
                        l = d + ((l & 7 | 0) == 0 ? 0 : 0 - l & 7) | 0;
                        b = e + 8 | 0;
                        b = e + ((b & 7 | 0) == 0 ? 0 : 0 - b & 7) | 0;
                        k = l + m | 0;
                        i = b - l - m | 0;
                        f[l + 4 >> 2] = m | 3;
                        g:
                            do
                                if ((j | 0) == (b | 0)) {
                                    s = (f[17567] | 0) + i | 0;
                                    f[17567] = s;
                                    f[17570] = k;
                                    f[k + 4 >> 2] = s | 1;
                                } else {
                                    if ((f[17569] | 0) == (b | 0)) {
                                        s = (f[17566] | 0) + i | 0;
                                        f[17566] = s;
                                        f[17569] = k;
                                        f[k + 4 >> 2] = s | 1;
                                        f[k + s >> 2] = s;
                                        break;
                                    }
                                    a = f[b + 4 >> 2] | 0;
                                    if ((a & 3 | 0) == 1) {
                                        h = a & -8;
                                        d = a >>> 3;
                                        h:
                                            do
                                                if (a >>> 0 < 256) {
                                                    a = f[b + 8 >> 2] | 0;
                                                    c = f[b + 12 >> 2] | 0;
                                                    if ((c | 0) == (a | 0)) {
                                                        f[17564] = f[17564] & ~(1 << d);
                                                        break;
                                                    } else {
                                                        f[a + 12 >> 2] = c;
                                                        f[c + 8 >> 2] = a;
                                                        break;
                                                    }
                                                } else {
                                                    g = f[b + 24 >> 2] | 0;
                                                    a = f[b + 12 >> 2] | 0;
                                                    do
                                                        if ((a | 0) == (b | 0)) {
                                                            c = b + 16 | 0;
                                                            d = c + 4 | 0;
                                                            a = f[d >> 2] | 0;
                                                            if (!a) {
                                                                a = f[c >> 2] | 0;
                                                                if (!a) {
                                                                    a = 0;
                                                                    break;
                                                                }
                                                            } else
                                                                c = d;
                                                            while (1) {
                                                                e = a + 20 | 0;
                                                                d = f[e >> 2] | 0;
                                                                if (!d) {
                                                                    e = a + 16 | 0;
                                                                    d = f[e >> 2] | 0;
                                                                    if (!d)
                                                                        break;
                                                                    else {
                                                                        a = d;
                                                                        c = e;
                                                                    }
                                                                } else {
                                                                    a = d;
                                                                    c = e;
                                                                }
                                                            }
                                                            f[c >> 2] = 0;
                                                        } else {
                                                            s = f[b + 8 >> 2] | 0;
                                                            f[s + 12 >> 2] = a;
                                                            f[a + 8 >> 2] = s;
                                                        }
                                                    while (0);
                                                    if (!g)
                                                        break;
                                                    c = f[b + 28 >> 2] | 0;
                                                    d = 70560 + (c << 2) | 0;
                                                    do
                                                        if ((f[d >> 2] | 0) != (b | 0)) {
                                                            s = g + 16 | 0;
                                                            f[((f[s >> 2] | 0) == (b | 0) ? s : g + 20 | 0) >> 2] = a;
                                                            if (!a)
                                                                break h;
                                                        } else {
                                                            f[d >> 2] = a;
                                                            if (a | 0)
                                                                break;
                                                            f[17565] = f[17565] & ~(1 << c);
                                                            break h;
                                                        }
                                                    while (0);
                                                    f[a + 24 >> 2] = g;
                                                    c = b + 16 | 0;
                                                    d = f[c >> 2] | 0;
                                                    if (d | 0) {
                                                        f[a + 16 >> 2] = d;
                                                        f[d + 24 >> 2] = a;
                                                    }
                                                    c = f[c + 4 >> 2] | 0;
                                                    if (!c)
                                                        break;
                                                    f[a + 20 >> 2] = c;
                                                    f[c + 24 >> 2] = a;
                                                }
                                            while (0);
                                        b = b + h | 0;
                                        e = h + i | 0;
                                    } else
                                        e = i;
                                    b = b + 4 | 0;
                                    f[b >> 2] = f[b >> 2] & -2;
                                    f[k + 4 >> 2] = e | 1;
                                    f[k + e >> 2] = e;
                                    b = e >>> 3;
                                    if (e >>> 0 < 256) {
                                        c = 70296 + (b << 1 << 2) | 0;
                                        a = f[17564] | 0;
                                        b = 1 << b;
                                        if (!(a & b)) {
                                            f[17564] = a | b;
                                            b = c;
                                            a = c + 8 | 0;
                                        } else {
                                            a = c + 8 | 0;
                                            b = f[a >> 2] | 0;
                                        }
                                        f[a >> 2] = k;
                                        f[b + 12 >> 2] = k;
                                        f[k + 8 >> 2] = b;
                                        f[k + 12 >> 2] = c;
                                        break;
                                    }
                                    b = e >>> 8;
                                    do
                                        if (!b)
                                            d = 0;
                                        else {
                                            if (e >>> 0 > 16777215) {
                                                d = 31;
                                                break;
                                            }
                                            r = (b + 1048320 | 0) >>> 16 & 8;
                                            s = b << r;
                                            q = (s + 520192 | 0) >>> 16 & 4;
                                            s = s << q;
                                            d = (s + 245760 | 0) >>> 16 & 2;
                                            d = 14 - (q | r | d) + (s << d >>> 15) | 0;
                                            d = e >>> (d + 7 | 0) & 1 | d << 1;
                                        }
                                    while (0);
                                    b = 70560 + (d << 2) | 0;
                                    f[k + 28 >> 2] = d;
                                    a = k + 16 | 0;
                                    f[a + 4 >> 2] = 0;
                                    f[a >> 2] = 0;
                                    a = f[17565] | 0;
                                    c = 1 << d;
                                    if (!(a & c)) {
                                        f[17565] = a | c;
                                        f[b >> 2] = k;
                                        f[k + 24 >> 2] = b;
                                        f[k + 12 >> 2] = k;
                                        f[k + 8 >> 2] = k;
                                        break;
                                    }
                                    b = f[b >> 2] | 0;
                                    i:
                                        do
                                            if ((f[b + 4 >> 2] & -8 | 0) != (e | 0)) {
                                                d = e << ((d | 0) == 31 ? 0 : 25 - (d >>> 1) | 0);
                                                while (1) {
                                                    c = b + 16 + (d >>> 31 << 2) | 0;
                                                    a = f[c >> 2] | 0;
                                                    if (!a)
                                                        break;
                                                    if ((f[a + 4 >> 2] & -8 | 0) == (e | 0)) {
                                                        b = a;
                                                        break i;
                                                    } else {
                                                        d = d << 1;
                                                        b = a;
                                                    }
                                                }
                                                f[c >> 2] = k;
                                                f[k + 24 >> 2] = b;
                                                f[k + 12 >> 2] = k;
                                                f[k + 8 >> 2] = k;
                                                break g;
                                            }
                                        while (0);
                                    r = b + 8 | 0;
                                    s = f[r >> 2] | 0;
                                    f[s + 12 >> 2] = k;
                                    f[r >> 2] = k;
                                    f[k + 8 >> 2] = s;
                                    f[k + 12 >> 2] = b;
                                    f[k + 24 >> 2] = 0;
                                }
                            while (0);
                        s = l + 8 | 0;
                        u = t;
                        return s | 0;
                    }
                    a = 70704;
                    while (1) {
                        c = f[a >> 2] | 0;
                        if (c >>> 0 <= j >>> 0 ? (s = c + (f[a + 4 >> 2] | 0) | 0, s >>> 0 > j >>> 0) : 0)
                            break;
                        a = f[a + 8 >> 2] | 0;
                    }
                    e = s + -47 | 0;
                    a = e + 8 | 0;
                    a = e + ((a & 7 | 0) == 0 ? 0 : 0 - a & 7) | 0;
                    e = j + 16 | 0;
                    a = a >>> 0 < e >>> 0 ? j : a;
                    r = a + 8 | 0;
                    c = b + -40 | 0;
                    p = d + 8 | 0;
                    p = (p & 7 | 0) == 0 ? 0 : 0 - p & 7;
                    q = d + p | 0;
                    p = c - p | 0;
                    f[17570] = q;
                    f[17567] = p;
                    f[q + 4 >> 2] = p | 1;
                    f[d + c + 4 >> 2] = 40;
                    f[17571] = f[17686];
                    c = a + 4 | 0;
                    f[c >> 2] = 27;
                    f[r >> 2] = f[17676];
                    f[r + 4 >> 2] = f[17677];
                    f[r + 8 >> 2] = f[17678];
                    f[r + 12 >> 2] = f[17679];
                    f[17676] = d;
                    f[17677] = b;
                    f[17679] = 0;
                    f[17678] = r;
                    b = a + 24 | 0;
                    do {
                        r = b;
                        b = b + 4 | 0;
                        f[b >> 2] = 7;
                    } while ((r + 8 | 0) >>> 0 < s >>> 0);
                    if ((a | 0) != (j | 0)) {
                        g = a - j | 0;
                        f[c >> 2] = f[c >> 2] & -2;
                        f[j + 4 >> 2] = g | 1;
                        f[a >> 2] = g;
                        b = g >>> 3;
                        if (g >>> 0 < 256) {
                            c = 70296 + (b << 1 << 2) | 0;
                            a = f[17564] | 0;
                            b = 1 << b;
                            if (!(a & b)) {
                                f[17564] = a | b;
                                b = c;
                                a = c + 8 | 0;
                            } else {
                                a = c + 8 | 0;
                                b = f[a >> 2] | 0;
                            }
                            f[a >> 2] = j;
                            f[b + 12 >> 2] = j;
                            f[j + 8 >> 2] = b;
                            f[j + 12 >> 2] = c;
                            break;
                        }
                        b = g >>> 8;
                        if (b)
                            if (g >>> 0 > 16777215)
                                d = 31;
                            else {
                                r = (b + 1048320 | 0) >>> 16 & 8;
                                s = b << r;
                                q = (s + 520192 | 0) >>> 16 & 4;
                                s = s << q;
                                d = (s + 245760 | 0) >>> 16 & 2;
                                d = 14 - (q | r | d) + (s << d >>> 15) | 0;
                                d = g >>> (d + 7 | 0) & 1 | d << 1;
                            }
                        else
                            d = 0;
                        c = 70560 + (d << 2) | 0;
                        f[j + 28 >> 2] = d;
                        f[j + 20 >> 2] = 0;
                        f[e >> 2] = 0;
                        b = f[17565] | 0;
                        a = 1 << d;
                        if (!(b & a)) {
                            f[17565] = b | a;
                            f[c >> 2] = j;
                            f[j + 24 >> 2] = c;
                            f[j + 12 >> 2] = j;
                            f[j + 8 >> 2] = j;
                            break;
                        }
                        b = f[c >> 2] | 0;
                        j:
                            do
                                if ((f[b + 4 >> 2] & -8 | 0) != (g | 0)) {
                                    d = g << ((d | 0) == 31 ? 0 : 25 - (d >>> 1) | 0);
                                    while (1) {
                                        c = b + 16 + (d >>> 31 << 2) | 0;
                                        a = f[c >> 2] | 0;
                                        if (!a)
                                            break;
                                        if ((f[a + 4 >> 2] & -8 | 0) == (g | 0)) {
                                            b = a;
                                            break j;
                                        } else {
                                            d = d << 1;
                                            b = a;
                                        }
                                    }
                                    f[c >> 2] = j;
                                    f[j + 24 >> 2] = b;
                                    f[j + 12 >> 2] = j;
                                    f[j + 8 >> 2] = j;
                                    break f;
                                }
                            while (0);
                        r = b + 8 | 0;
                        s = f[r >> 2] | 0;
                        f[s + 12 >> 2] = j;
                        f[r >> 2] = j;
                        f[j + 8 >> 2] = s;
                        f[j + 12 >> 2] = b;
                        f[j + 24 >> 2] = 0;
                    }
                } else {
                    s = f[17568] | 0;
                    if ((s | 0) == 0 | d >>> 0 < s >>> 0)
                        f[17568] = d;
                    f[17676] = d;
                    f[17677] = b;
                    f[17679] = 0;
                    f[17573] = f[17682];
                    f[17572] = -1;
                    f[17577] = 70296;
                    f[17576] = 70296;
                    f[17579] = 70304;
                    f[17578] = 70304;
                    f[17581] = 70312;
                    f[17580] = 70312;
                    f[17583] = 70320;
                    f[17582] = 70320;
                    f[17585] = 70328;
                    f[17584] = 70328;
                    f[17587] = 70336;
                    f[17586] = 70336;
                    f[17589] = 70344;
                    f[17588] = 70344;
                    f[17591] = 70352;
                    f[17590] = 70352;
                    f[17593] = 70360;
                    f[17592] = 70360;
                    f[17595] = 70368;
                    f[17594] = 70368;
                    f[17597] = 70376;
                    f[17596] = 70376;
                    f[17599] = 70384;
                    f[17598] = 70384;
                    f[17601] = 70392;
                    f[17600] = 70392;
                    f[17603] = 70400;
                    f[17602] = 70400;
                    f[17605] = 70408;
                    f[17604] = 70408;
                    f[17607] = 70416;
                    f[17606] = 70416;
                    f[17609] = 70424;
                    f[17608] = 70424;
                    f[17611] = 70432;
                    f[17610] = 70432;
                    f[17613] = 70440;
                    f[17612] = 70440;
                    f[17615] = 70448;
                    f[17614] = 70448;
                    f[17617] = 70456;
                    f[17616] = 70456;
                    f[17619] = 70464;
                    f[17618] = 70464;
                    f[17621] = 70472;
                    f[17620] = 70472;
                    f[17623] = 70480;
                    f[17622] = 70480;
                    f[17625] = 70488;
                    f[17624] = 70488;
                    f[17627] = 70496;
                    f[17626] = 70496;
                    f[17629] = 70504;
                    f[17628] = 70504;
                    f[17631] = 70512;
                    f[17630] = 70512;
                    f[17633] = 70520;
                    f[17632] = 70520;
                    f[17635] = 70528;
                    f[17634] = 70528;
                    f[17637] = 70536;
                    f[17636] = 70536;
                    f[17639] = 70544;
                    f[17638] = 70544;
                    s = b + -40 | 0;
                    q = d + 8 | 0;
                    q = (q & 7 | 0) == 0 ? 0 : 0 - q & 7;
                    r = d + q | 0;
                    q = s - q | 0;
                    f[17570] = r;
                    f[17567] = q;
                    f[r + 4 >> 2] = q | 1;
                    f[d + s + 4 >> 2] = 40;
                    f[17571] = f[17686];
                }
            while (0);
        b = f[17567] | 0;
        if (b >>> 0 <= m >>> 0) {
            s = 0;
            u = t;
            return s | 0;
        }
        q = b - m | 0;
        f[17567] = q;
        s = f[17570] | 0;
        r = s + m | 0;
        f[17570] = r;
        f[r + 4 >> 2] = q | 1;
        f[s + 4 >> 2] = m | 3;
        s = s + 8 | 0;
        u = t;
        return s | 0;
    }
    function oc(a) {
        a = a | 0;
        var b = 0, c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0;
        if (!a)
            return;
        c = a + -8 | 0;
        e = f[17568] | 0;
        a = f[a + -4 >> 2] | 0;
        b = a & -8;
        j = c + b | 0;
        do
            if (!(a & 1)) {
                d = f[c >> 2] | 0;
                if (!(a & 3))
                    return;
                h = c + (0 - d) | 0;
                g = d + b | 0;
                if (h >>> 0 < e >>> 0)
                    return;
                if ((f[17569] | 0) == (h | 0)) {
                    a = j + 4 | 0;
                    b = f[a >> 2] | 0;
                    if ((b & 3 | 0) != 3) {
                        i = h;
                        b = g;
                        break;
                    }
                    f[17566] = g;
                    f[a >> 2] = b & -2;
                    f[h + 4 >> 2] = g | 1;
                    f[h + g >> 2] = g;
                    return;
                }
                c = d >>> 3;
                if (d >>> 0 < 256) {
                    a = f[h + 8 >> 2] | 0;
                    b = f[h + 12 >> 2] | 0;
                    if ((b | 0) == (a | 0)) {
                        f[17564] = f[17564] & ~(1 << c);
                        i = h;
                        b = g;
                        break;
                    } else {
                        f[a + 12 >> 2] = b;
                        f[b + 8 >> 2] = a;
                        i = h;
                        b = g;
                        break;
                    }
                }
                e = f[h + 24 >> 2] | 0;
                a = f[h + 12 >> 2] | 0;
                do
                    if ((a | 0) == (h | 0)) {
                        b = h + 16 | 0;
                        c = b + 4 | 0;
                        a = f[c >> 2] | 0;
                        if (!a) {
                            a = f[b >> 2] | 0;
                            if (!a) {
                                a = 0;
                                break;
                            }
                        } else
                            b = c;
                        while (1) {
                            d = a + 20 | 0;
                            c = f[d >> 2] | 0;
                            if (!c) {
                                d = a + 16 | 0;
                                c = f[d >> 2] | 0;
                                if (!c)
                                    break;
                                else {
                                    a = c;
                                    b = d;
                                }
                            } else {
                                a = c;
                                b = d;
                            }
                        }
                        f[b >> 2] = 0;
                    } else {
                        i = f[h + 8 >> 2] | 0;
                        f[i + 12 >> 2] = a;
                        f[a + 8 >> 2] = i;
                    }
                while (0);
                if (e) {
                    b = f[h + 28 >> 2] | 0;
                    c = 70560 + (b << 2) | 0;
                    if ((f[c >> 2] | 0) == (h | 0)) {
                        f[c >> 2] = a;
                        if (!a) {
                            f[17565] = f[17565] & ~(1 << b);
                            i = h;
                            b = g;
                            break;
                        }
                    } else {
                        i = e + 16 | 0;
                        f[((f[i >> 2] | 0) == (h | 0) ? i : e + 20 | 0) >> 2] = a;
                        if (!a) {
                            i = h;
                            b = g;
                            break;
                        }
                    }
                    f[a + 24 >> 2] = e;
                    b = h + 16 | 0;
                    c = f[b >> 2] | 0;
                    if (c | 0) {
                        f[a + 16 >> 2] = c;
                        f[c + 24 >> 2] = a;
                    }
                    b = f[b + 4 >> 2] | 0;
                    if (b) {
                        f[a + 20 >> 2] = b;
                        f[b + 24 >> 2] = a;
                        i = h;
                        b = g;
                    } else {
                        i = h;
                        b = g;
                    }
                } else {
                    i = h;
                    b = g;
                }
            } else {
                i = c;
                h = c;
            }
        while (0);
        if (h >>> 0 >= j >>> 0)
            return;
        a = j + 4 | 0;
        d = f[a >> 2] | 0;
        if (!(d & 1))
            return;
        if (!(d & 2)) {
            if ((f[17570] | 0) == (j | 0)) {
                j = (f[17567] | 0) + b | 0;
                f[17567] = j;
                f[17570] = i;
                f[i + 4 >> 2] = j | 1;
                if ((i | 0) != (f[17569] | 0))
                    return;
                f[17569] = 0;
                f[17566] = 0;
                return;
            }
            if ((f[17569] | 0) == (j | 0)) {
                j = (f[17566] | 0) + b | 0;
                f[17566] = j;
                f[17569] = h;
                f[i + 4 >> 2] = j | 1;
                f[h + j >> 2] = j;
                return;
            }
            e = (d & -8) + b | 0;
            c = d >>> 3;
            do
                if (d >>> 0 < 256) {
                    b = f[j + 8 >> 2] | 0;
                    a = f[j + 12 >> 2] | 0;
                    if ((a | 0) == (b | 0)) {
                        f[17564] = f[17564] & ~(1 << c);
                        break;
                    } else {
                        f[b + 12 >> 2] = a;
                        f[a + 8 >> 2] = b;
                        break;
                    }
                } else {
                    g = f[j + 24 >> 2] | 0;
                    a = f[j + 12 >> 2] | 0;
                    do
                        if ((a | 0) == (j | 0)) {
                            b = j + 16 | 0;
                            c = b + 4 | 0;
                            a = f[c >> 2] | 0;
                            if (!a) {
                                a = f[b >> 2] | 0;
                                if (!a) {
                                    c = 0;
                                    break;
                                }
                            } else
                                b = c;
                            while (1) {
                                d = a + 20 | 0;
                                c = f[d >> 2] | 0;
                                if (!c) {
                                    d = a + 16 | 0;
                                    c = f[d >> 2] | 0;
                                    if (!c)
                                        break;
                                    else {
                                        a = c;
                                        b = d;
                                    }
                                } else {
                                    a = c;
                                    b = d;
                                }
                            }
                            f[b >> 2] = 0;
                            c = a;
                        } else {
                            c = f[j + 8 >> 2] | 0;
                            f[c + 12 >> 2] = a;
                            f[a + 8 >> 2] = c;
                            c = a;
                        }
                    while (0);
                    if (g | 0) {
                        a = f[j + 28 >> 2] | 0;
                        b = 70560 + (a << 2) | 0;
                        if ((f[b >> 2] | 0) == (j | 0)) {
                            f[b >> 2] = c;
                            if (!c) {
                                f[17565] = f[17565] & ~(1 << a);
                                break;
                            }
                        } else {
                            d = g + 16 | 0;
                            f[((f[d >> 2] | 0) == (j | 0) ? d : g + 20 | 0) >> 2] = c;
                            if (!c)
                                break;
                        }
                        f[c + 24 >> 2] = g;
                        a = j + 16 | 0;
                        b = f[a >> 2] | 0;
                        if (b | 0) {
                            f[c + 16 >> 2] = b;
                            f[b + 24 >> 2] = c;
                        }
                        a = f[a + 4 >> 2] | 0;
                        if (a | 0) {
                            f[c + 20 >> 2] = a;
                            f[a + 24 >> 2] = c;
                        }
                    }
                }
            while (0);
            f[i + 4 >> 2] = e | 1;
            f[h + e >> 2] = e;
            if ((i | 0) == (f[17569] | 0)) {
                f[17566] = e;
                return;
            }
        } else {
            f[a >> 2] = d & -2;
            f[i + 4 >> 2] = b | 1;
            f[h + b >> 2] = b;
            e = b;
        }
        a = e >>> 3;
        if (e >>> 0 < 256) {
            c = 70296 + (a << 1 << 2) | 0;
            b = f[17564] | 0;
            a = 1 << a;
            if (!(b & a)) {
                f[17564] = b | a;
                a = c;
                b = c + 8 | 0;
            } else {
                b = c + 8 | 0;
                a = f[b >> 2] | 0;
            }
            f[b >> 2] = i;
            f[a + 12 >> 2] = i;
            f[i + 8 >> 2] = a;
            f[i + 12 >> 2] = c;
            return;
        }
        a = e >>> 8;
        if (a)
            if (e >>> 0 > 16777215)
                d = 31;
            else {
                h = (a + 1048320 | 0) >>> 16 & 8;
                j = a << h;
                g = (j + 520192 | 0) >>> 16 & 4;
                j = j << g;
                d = (j + 245760 | 0) >>> 16 & 2;
                d = 14 - (g | h | d) + (j << d >>> 15) | 0;
                d = e >>> (d + 7 | 0) & 1 | d << 1;
            }
        else
            d = 0;
        a = 70560 + (d << 2) | 0;
        f[i + 28 >> 2] = d;
        f[i + 20 >> 2] = 0;
        f[i + 16 >> 2] = 0;
        b = f[17565] | 0;
        c = 1 << d;
        a:
            do
                if (!(b & c)) {
                    f[17565] = b | c;
                    f[a >> 2] = i;
                    f[i + 24 >> 2] = a;
                    f[i + 12 >> 2] = i;
                    f[i + 8 >> 2] = i;
                } else {
                    a = f[a >> 2] | 0;
                    b:
                        do
                            if ((f[a + 4 >> 2] & -8 | 0) != (e | 0)) {
                                d = e << ((d | 0) == 31 ? 0 : 25 - (d >>> 1) | 0);
                                while (1) {
                                    c = a + 16 + (d >>> 31 << 2) | 0;
                                    b = f[c >> 2] | 0;
                                    if (!b)
                                        break;
                                    if ((f[b + 4 >> 2] & -8 | 0) == (e | 0)) {
                                        a = b;
                                        break b;
                                    } else {
                                        d = d << 1;
                                        a = b;
                                    }
                                }
                                f[c >> 2] = i;
                                f[i + 24 >> 2] = a;
                                f[i + 12 >> 2] = i;
                                f[i + 8 >> 2] = i;
                                break a;
                            }
                        while (0);
                    h = a + 8 | 0;
                    j = f[h >> 2] | 0;
                    f[j + 12 >> 2] = i;
                    f[h >> 2] = i;
                    f[i + 8 >> 2] = j;
                    f[i + 12 >> 2] = a;
                    f[i + 24 >> 2] = 0;
                }
            while (0);
        j = (f[17572] | 0) + -1 | 0;
        f[17572] = j;
        if (j | 0)
            return;
        a = 70712;
        while (1) {
            a = f[a >> 2] | 0;
            if (!a)
                break;
            else
                a = a + 8 | 0;
        }
        f[17572] = -1;
        return;
    }
    function pc(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0;
        if (!a) {
            b = nc(b) | 0;
            return b | 0;
        }
        if (b >>> 0 > 4294967231) {
            b = 0;
            return b | 0;
        }
        c = qc(a + -8 | 0, b >>> 0 < 11 ? 16 : b + 11 & -8) | 0;
        if (c | 0) {
            b = c + 8 | 0;
            return b | 0;
        }
        c = nc(b) | 0;
        if (!c) {
            b = 0;
            return b | 0;
        }
        d = f[a + -4 >> 2] | 0;
        d = (d & -8) - ((d & 3 | 0) == 0 ? 8 : 4) | 0;
        Uc(c | 0, a | 0, (d >>> 0 < b >>> 0 ? d : b) | 0) | 0;
        oc(a);
        b = c;
        return b | 0;
    }
    function qc(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0;
        l = a + 4 | 0;
        m = f[l >> 2] | 0;
        c = m & -8;
        i = a + c | 0;
        if (!(m & 3)) {
            if (b >>> 0 < 256) {
                a = 0;
                return a | 0;
            }
            if (c >>> 0 >= (b + 4 | 0) >>> 0 ? (c - b | 0) >>> 0 <= f[17684] << 1 >>> 0 : 0)
                return a | 0;
            a = 0;
            return a | 0;
        }
        if (c >>> 0 >= b >>> 0) {
            c = c - b | 0;
            if (c >>> 0 <= 15)
                return a | 0;
            k = a + b | 0;
            f[l >> 2] = m & 1 | b | 2;
            f[k + 4 >> 2] = c | 3;
            m = i + 4 | 0;
            f[m >> 2] = f[m >> 2] | 1;
            rc(k, c);
            return a | 0;
        }
        if ((f[17570] | 0) == (i | 0)) {
            k = (f[17567] | 0) + c | 0;
            c = k - b | 0;
            d = a + b | 0;
            if (k >>> 0 <= b >>> 0) {
                a = 0;
                return a | 0;
            }
            f[l >> 2] = m & 1 | b | 2;
            f[d + 4 >> 2] = c | 1;
            f[17570] = d;
            f[17567] = c;
            return a | 0;
        }
        if ((f[17569] | 0) == (i | 0)) {
            d = (f[17566] | 0) + c | 0;
            if (d >>> 0 < b >>> 0) {
                a = 0;
                return a | 0;
            }
            c = d - b | 0;
            if (c >>> 0 > 15) {
                k = a + b | 0;
                d = a + d | 0;
                f[l >> 2] = m & 1 | b | 2;
                f[k + 4 >> 2] = c | 1;
                f[d >> 2] = c;
                d = d + 4 | 0;
                f[d >> 2] = f[d >> 2] & -2;
                d = k;
            } else {
                f[l >> 2] = m & 1 | d | 2;
                d = a + d + 4 | 0;
                f[d >> 2] = f[d >> 2] | 1;
                d = 0;
                c = 0;
            }
            f[17566] = c;
            f[17569] = d;
            return a | 0;
        }
        d = f[i + 4 >> 2] | 0;
        if (d & 2 | 0) {
            a = 0;
            return a | 0;
        }
        j = (d & -8) + c | 0;
        if (j >>> 0 < b >>> 0) {
            a = 0;
            return a | 0;
        }
        k = j - b | 0;
        e = d >>> 3;
        do
            if (d >>> 0 < 256) {
                d = f[i + 8 >> 2] | 0;
                c = f[i + 12 >> 2] | 0;
                if ((c | 0) == (d | 0)) {
                    f[17564] = f[17564] & ~(1 << e);
                    break;
                } else {
                    f[d + 12 >> 2] = c;
                    f[c + 8 >> 2] = d;
                    break;
                }
            } else {
                h = f[i + 24 >> 2] | 0;
                c = f[i + 12 >> 2] | 0;
                do
                    if ((c | 0) == (i | 0)) {
                        d = i + 16 | 0;
                        e = d + 4 | 0;
                        c = f[e >> 2] | 0;
                        if (!c) {
                            c = f[d >> 2] | 0;
                            if (!c) {
                                e = 0;
                                break;
                            }
                        } else
                            d = e;
                        while (1) {
                            g = c + 20 | 0;
                            e = f[g >> 2] | 0;
                            if (!e) {
                                g = c + 16 | 0;
                                e = f[g >> 2] | 0;
                                if (!e)
                                    break;
                                else {
                                    c = e;
                                    d = g;
                                }
                            } else {
                                c = e;
                                d = g;
                            }
                        }
                        f[d >> 2] = 0;
                        e = c;
                    } else {
                        e = f[i + 8 >> 2] | 0;
                        f[e + 12 >> 2] = c;
                        f[c + 8 >> 2] = e;
                        e = c;
                    }
                while (0);
                if (h | 0) {
                    c = f[i + 28 >> 2] | 0;
                    d = 70560 + (c << 2) | 0;
                    if ((f[d >> 2] | 0) == (i | 0)) {
                        f[d >> 2] = e;
                        if (!e) {
                            f[17565] = f[17565] & ~(1 << c);
                            break;
                        }
                    } else {
                        g = h + 16 | 0;
                        f[((f[g >> 2] | 0) == (i | 0) ? g : h + 20 | 0) >> 2] = e;
                        if (!e)
                            break;
                    }
                    f[e + 24 >> 2] = h;
                    c = i + 16 | 0;
                    d = f[c >> 2] | 0;
                    if (d | 0) {
                        f[e + 16 >> 2] = d;
                        f[d + 24 >> 2] = e;
                    }
                    c = f[c + 4 >> 2] | 0;
                    if (c | 0) {
                        f[e + 20 >> 2] = c;
                        f[c + 24 >> 2] = e;
                    }
                }
            }
        while (0);
        if (k >>> 0 < 16) {
            f[l >> 2] = m & 1 | j | 2;
            m = a + j + 4 | 0;
            f[m >> 2] = f[m >> 2] | 1;
            return a | 0;
        } else {
            i = a + b | 0;
            f[l >> 2] = m & 1 | b | 2;
            f[i + 4 >> 2] = k | 3;
            m = a + j + 4 | 0;
            f[m >> 2] = f[m >> 2] | 1;
            rc(i, k);
            return a | 0;
        }
        return 0;
    }
    function rc(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0, g = 0, h = 0, i = 0;
        i = a + b | 0;
        c = f[a + 4 >> 2] | 0;
        do
            if (!(c & 1)) {
                e = f[a >> 2] | 0;
                if (!(c & 3))
                    return;
                h = a + (0 - e) | 0;
                b = e + b | 0;
                if ((f[17569] | 0) == (h | 0)) {
                    a = i + 4 | 0;
                    c = f[a >> 2] | 0;
                    if ((c & 3 | 0) != 3)
                        break;
                    f[17566] = b;
                    f[a >> 2] = c & -2;
                    f[h + 4 >> 2] = b | 1;
                    f[i >> 2] = b;
                    return;
                }
                d = e >>> 3;
                if (e >>> 0 < 256) {
                    a = f[h + 8 >> 2] | 0;
                    c = f[h + 12 >> 2] | 0;
                    if ((c | 0) == (a | 0)) {
                        f[17564] = f[17564] & ~(1 << d);
                        break;
                    } else {
                        f[a + 12 >> 2] = c;
                        f[c + 8 >> 2] = a;
                        break;
                    }
                }
                g = f[h + 24 >> 2] | 0;
                a = f[h + 12 >> 2] | 0;
                do
                    if ((a | 0) == (h | 0)) {
                        c = h + 16 | 0;
                        d = c + 4 | 0;
                        a = f[d >> 2] | 0;
                        if (!a) {
                            a = f[c >> 2] | 0;
                            if (!a) {
                                a = 0;
                                break;
                            }
                        } else
                            c = d;
                        while (1) {
                            e = a + 20 | 0;
                            d = f[e >> 2] | 0;
                            if (!d) {
                                e = a + 16 | 0;
                                d = f[e >> 2] | 0;
                                if (!d)
                                    break;
                                else {
                                    a = d;
                                    c = e;
                                }
                            } else {
                                a = d;
                                c = e;
                            }
                        }
                        f[c >> 2] = 0;
                    } else {
                        e = f[h + 8 >> 2] | 0;
                        f[e + 12 >> 2] = a;
                        f[a + 8 >> 2] = e;
                    }
                while (0);
                if (g) {
                    c = f[h + 28 >> 2] | 0;
                    d = 70560 + (c << 2) | 0;
                    if ((f[d >> 2] | 0) == (h | 0)) {
                        f[d >> 2] = a;
                        if (!a) {
                            f[17565] = f[17565] & ~(1 << c);
                            break;
                        }
                    } else {
                        e = g + 16 | 0;
                        f[((f[e >> 2] | 0) == (h | 0) ? e : g + 20 | 0) >> 2] = a;
                        if (!a)
                            break;
                    }
                    f[a + 24 >> 2] = g;
                    c = h + 16 | 0;
                    d = f[c >> 2] | 0;
                    if (d | 0) {
                        f[a + 16 >> 2] = d;
                        f[d + 24 >> 2] = a;
                    }
                    c = f[c + 4 >> 2] | 0;
                    if (c) {
                        f[a + 20 >> 2] = c;
                        f[c + 24 >> 2] = a;
                    }
                }
            } else
                h = a;
        while (0);
        a = i + 4 | 0;
        d = f[a >> 2] | 0;
        if (!(d & 2)) {
            if ((f[17570] | 0) == (i | 0)) {
                i = (f[17567] | 0) + b | 0;
                f[17567] = i;
                f[17570] = h;
                f[h + 4 >> 2] = i | 1;
                if ((h | 0) != (f[17569] | 0))
                    return;
                f[17569] = 0;
                f[17566] = 0;
                return;
            }
            if ((f[17569] | 0) == (i | 0)) {
                i = (f[17566] | 0) + b | 0;
                f[17566] = i;
                f[17569] = h;
                f[h + 4 >> 2] = i | 1;
                f[h + i >> 2] = i;
                return;
            }
            e = (d & -8) + b | 0;
            c = d >>> 3;
            do
                if (d >>> 0 < 256) {
                    a = f[i + 8 >> 2] | 0;
                    b = f[i + 12 >> 2] | 0;
                    if ((b | 0) == (a | 0)) {
                        f[17564] = f[17564] & ~(1 << c);
                        break;
                    } else {
                        f[a + 12 >> 2] = b;
                        f[b + 8 >> 2] = a;
                        break;
                    }
                } else {
                    g = f[i + 24 >> 2] | 0;
                    b = f[i + 12 >> 2] | 0;
                    do
                        if ((b | 0) == (i | 0)) {
                            a = i + 16 | 0;
                            c = a + 4 | 0;
                            b = f[c >> 2] | 0;
                            if (!b) {
                                b = f[a >> 2] | 0;
                                if (!b) {
                                    c = 0;
                                    break;
                                }
                            } else
                                a = c;
                            while (1) {
                                d = b + 20 | 0;
                                c = f[d >> 2] | 0;
                                if (!c) {
                                    d = b + 16 | 0;
                                    c = f[d >> 2] | 0;
                                    if (!c)
                                        break;
                                    else {
                                        b = c;
                                        a = d;
                                    }
                                } else {
                                    b = c;
                                    a = d;
                                }
                            }
                            f[a >> 2] = 0;
                            c = b;
                        } else {
                            c = f[i + 8 >> 2] | 0;
                            f[c + 12 >> 2] = b;
                            f[b + 8 >> 2] = c;
                            c = b;
                        }
                    while (0);
                    if (g | 0) {
                        b = f[i + 28 >> 2] | 0;
                        a = 70560 + (b << 2) | 0;
                        if ((f[a >> 2] | 0) == (i | 0)) {
                            f[a >> 2] = c;
                            if (!c) {
                                f[17565] = f[17565] & ~(1 << b);
                                break;
                            }
                        } else {
                            d = g + 16 | 0;
                            f[((f[d >> 2] | 0) == (i | 0) ? d : g + 20 | 0) >> 2] = c;
                            if (!c)
                                break;
                        }
                        f[c + 24 >> 2] = g;
                        b = i + 16 | 0;
                        a = f[b >> 2] | 0;
                        if (a | 0) {
                            f[c + 16 >> 2] = a;
                            f[a + 24 >> 2] = c;
                        }
                        b = f[b + 4 >> 2] | 0;
                        if (b | 0) {
                            f[c + 20 >> 2] = b;
                            f[b + 24 >> 2] = c;
                        }
                    }
                }
            while (0);
            f[h + 4 >> 2] = e | 1;
            f[h + e >> 2] = e;
            if ((h | 0) == (f[17569] | 0)) {
                f[17566] = e;
                return;
            }
        } else {
            f[a >> 2] = d & -2;
            f[h + 4 >> 2] = b | 1;
            f[h + b >> 2] = b;
            e = b;
        }
        b = e >>> 3;
        if (e >>> 0 < 256) {
            c = 70296 + (b << 1 << 2) | 0;
            a = f[17564] | 0;
            b = 1 << b;
            if (!(a & b)) {
                f[17564] = a | b;
                b = c;
                a = c + 8 | 0;
            } else {
                a = c + 8 | 0;
                b = f[a >> 2] | 0;
            }
            f[a >> 2] = h;
            f[b + 12 >> 2] = h;
            f[h + 8 >> 2] = b;
            f[h + 12 >> 2] = c;
            return;
        }
        b = e >>> 8;
        if (b)
            if (e >>> 0 > 16777215)
                d = 31;
            else {
                g = (b + 1048320 | 0) >>> 16 & 8;
                i = b << g;
                c = (i + 520192 | 0) >>> 16 & 4;
                i = i << c;
                d = (i + 245760 | 0) >>> 16 & 2;
                d = 14 - (c | g | d) + (i << d >>> 15) | 0;
                d = e >>> (d + 7 | 0) & 1 | d << 1;
            }
        else
            d = 0;
        b = 70560 + (d << 2) | 0;
        f[h + 28 >> 2] = d;
        f[h + 20 >> 2] = 0;
        f[h + 16 >> 2] = 0;
        a = f[17565] | 0;
        c = 1 << d;
        if (!(a & c)) {
            f[17565] = a | c;
            f[b >> 2] = h;
            f[h + 24 >> 2] = b;
            f[h + 12 >> 2] = h;
            f[h + 8 >> 2] = h;
            return;
        }
        b = f[b >> 2] | 0;
        a:
            do
                if ((f[b + 4 >> 2] & -8 | 0) != (e | 0)) {
                    d = e << ((d | 0) == 31 ? 0 : 25 - (d >>> 1) | 0);
                    while (1) {
                        c = b + 16 + (d >>> 31 << 2) | 0;
                        a = f[c >> 2] | 0;
                        if (!a)
                            break;
                        if ((f[a + 4 >> 2] & -8 | 0) == (e | 0)) {
                            b = a;
                            break a;
                        } else {
                            d = d << 1;
                            b = a;
                        }
                    }
                    f[c >> 2] = h;
                    f[h + 24 >> 2] = b;
                    f[h + 12 >> 2] = h;
                    f[h + 8 >> 2] = h;
                    return;
                }
            while (0);
        g = b + 8 | 0;
        i = f[g >> 2] | 0;
        f[i + 12 >> 2] = h;
        f[g >> 2] = h;
        f[h + 8 >> 2] = i;
        f[h + 12 >> 2] = b;
        f[h + 24 >> 2] = 0;
        return;
    }
    function sc(a, b) {
        a = a | 0;
        b = b | 0;
        if (a >>> 0 < 9) {
            b = nc(b) | 0;
            return b | 0;
        } else {
            b = tc(a, b) | 0;
            return b | 0;
        }
        return 0;
    }
    function tc(a, b) {
        a = a | 0;
        b = b | 0;
        var c = 0, d = 0, e = 0, g = 0, h = 0, i = 0;
        c = a >>> 0 > 16 ? a : 16;
        if (!(c + -1 & c))
            a = c;
        else {
            a = 16;
            while (1)
                if (a >>> 0 < c >>> 0)
                    a = a << 1;
                else
                    break;
        }
        if ((-64 - a | 0) >>> 0 <= b >>> 0) {
            h = 0;
            return h | 0;
        }
        g = b >>> 0 < 11 ? 16 : b + 11 & -8;
        c = nc(g + 12 + a | 0) | 0;
        if (!c) {
            h = 0;
            return h | 0;
        }
        e = c + -8 | 0;
        do
            if (a + -1 & c) {
                d = (c + a + -1 & 0 - a) + -8 | 0;
                b = e;
                d = (d - b | 0) >>> 0 > 15 ? d : d + a | 0;
                b = d - b | 0;
                a = c + -4 | 0;
                i = f[a >> 2] | 0;
                c = (i & -8) - b | 0;
                if (!(i & 3)) {
                    f[d >> 2] = (f[e >> 2] | 0) + b;
                    f[d + 4 >> 2] = c;
                    a = d;
                    b = d;
                    break;
                } else {
                    i = d + 4 | 0;
                    f[i >> 2] = c | f[i >> 2] & 1 | 2;
                    c = d + c + 4 | 0;
                    f[c >> 2] = f[c >> 2] | 1;
                    f[a >> 2] = b | f[a >> 2] & 1 | 2;
                    f[i >> 2] = f[i >> 2] | 1;
                    rc(e, b);
                    a = d;
                    b = d;
                    break;
                }
            } else {
                a = e;
                b = e;
            }
        while (0);
        a = a + 4 | 0;
        c = f[a >> 2] | 0;
        if (c & 3 | 0 ? (h = c & -8, h >>> 0 > (g + 16 | 0) >>> 0) : 0) {
            i = h - g | 0;
            e = b + g | 0;
            f[a >> 2] = g | c & 1 | 2;
            f[e + 4 >> 2] = i | 3;
            h = b + h + 4 | 0;
            f[h >> 2] = f[h >> 2] | 1;
            rc(e, i);
        }
        i = b + 8 | 0;
        return i | 0;
    }
    function uc() {
        ka(70768);
        return;
    }
    function vc() {
        return 70752;
    }
    function wc() {
        return 70760;
    }
    function xc() {
        return 70764;
    }
    function yc() {
        return 70768;
    }
    function zc(a) {
        a = a | 0;
        return;
    }
    function Ac(a) {
        a = a | 0;
        Qc(a);
        return;
    }
    function Bc(a) {
        a = a | 0;
        return;
    }
    function Cc(a) {
        a = a | 0;
        return;
    }
    function Dc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0, g = 0, h = 0;
        h = u;
        u = u + 64 | 0;
        e = h;
        if (!(Hc(a, b) | 0))
            if ((b | 0) != 0 ? (g = Lc(b, 8) | 0, (g | 0) != 0) : 0) {
                b = e + 4 | 0;
                d = b + 52 | 0;
                do {
                    f[b >> 2] = 0;
                    b = b + 4 | 0;
                } while ((b | 0) < (d | 0));
                f[e >> 2] = g;
                f[e + 8 >> 2] = a;
                f[e + 12 >> 2] = -1;
                f[e + 48 >> 2] = 1;
                va[f[(f[g >> 2] | 0) + 28 >> 2] & 3](g, e, f[c >> 2] | 0, 1);
                if ((f[e + 24 >> 2] | 0) == 1) {
                    f[c >> 2] = f[e + 16 >> 2];
                    b = 1;
                } else
                    b = 0;
            } else
                b = 0;
        else
            b = 1;
        u = h;
        return b | 0;
    }
    function Ec(a, b, c, d, e, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        if (Hc(a, f[b + 8 >> 2] | 0) | 0)
            Kc(b, c, d, e);
        return;
    }
    function Fc(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var h = 0;
        do
            if (!(Hc(a, f[c + 8 >> 2] | 0) | 0)) {
                if (Hc(a, f[c >> 2] | 0) | 0) {
                    if ((f[c + 16 >> 2] | 0) != (d | 0) ? (h = c + 20 | 0, (f[h >> 2] | 0) != (d | 0)) : 0) {
                        f[c + 32 >> 2] = e;
                        f[h >> 2] = d;
                        g = c + 40 | 0;
                        f[g >> 2] = (f[g >> 2] | 0) + 1;
                        if ((f[c + 36 >> 2] | 0) == 1 ? (f[c + 24 >> 2] | 0) == 2 : 0)
                            b[c + 54 >> 0] = 1;
                        f[c + 44 >> 2] = 4;
                        break;
                    }
                    if ((e | 0) == 1)
                        f[c + 32 >> 2] = 1;
                }
            } else
                Jc(c, d, e);
        while (0);
        return;
    }
    function Gc(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        if (Hc(a, f[b + 8 >> 2] | 0) | 0)
            Ic(b, c, d);
        return;
    }
    function Hc(a, b) {
        a = a | 0;
        b = b | 0;
        return (a | 0) == (b | 0) | 0;
    }
    function Ic(a, c, d) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0;
        e = a + 16 | 0;
        g = f[e >> 2] | 0;
        do
            if (g) {
                if ((g | 0) != (c | 0)) {
                    d = a + 36 | 0;
                    f[d >> 2] = (f[d >> 2] | 0) + 1;
                    f[a + 24 >> 2] = 2;
                    b[a + 54 >> 0] = 1;
                    break;
                }
                a = a + 24 | 0;
                if ((f[a >> 2] | 0) == 2)
                    f[a >> 2] = d;
            } else {
                f[e >> 2] = c;
                f[a + 24 >> 2] = d;
                f[a + 36 >> 2] = 1;
            }
        while (0);
        return;
    }
    function Jc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0;
        if ((f[a + 4 >> 2] | 0) == (b | 0) ? (d = a + 28 | 0, (f[d >> 2] | 0) != 1) : 0)
            f[d >> 2] = c;
        return;
    }
    function Kc(a, c, d, e) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        var g = 0;
        b[a + 53 >> 0] = 1;
        do
            if ((f[a + 4 >> 2] | 0) == (d | 0)) {
                b[a + 52 >> 0] = 1;
                g = a + 16 | 0;
                d = f[g >> 2] | 0;
                if (!d) {
                    f[g >> 2] = c;
                    f[a + 24 >> 2] = e;
                    f[a + 36 >> 2] = 1;
                    if (!((e | 0) == 1 ? (f[a + 48 >> 2] | 0) == 1 : 0))
                        break;
                    b[a + 54 >> 0] = 1;
                    break;
                }
                if ((d | 0) != (c | 0)) {
                    e = a + 36 | 0;
                    f[e >> 2] = (f[e >> 2] | 0) + 1;
                    b[a + 54 >> 0] = 1;
                    break;
                }
                g = a + 24 | 0;
                d = f[g >> 2] | 0;
                if ((d | 0) == 2) {
                    f[g >> 2] = e;
                    d = e;
                }
                if ((d | 0) == 1 ? (f[a + 48 >> 2] | 0) == 1 : 0)
                    b[a + 54 >> 0] = 1;
            }
        while (0);
        return;
    }
    function Lc(a, c) {
        a = a | 0;
        c = c | 0;
        var e = 0, g = 0, h = 0, i = 0, j = 0, k = 0, l = 0, m = 0, n = 0, o = 0, p = 0, q = 0;
        q = u;
        u = u + 64 | 0;
        n = q;
        p = f[a >> 2] | 0;
        o = a + (f[p + -8 >> 2] | 0) | 0;
        p = f[p + -4 >> 2] | 0;
        f[n >> 2] = c;
        f[n + 4 >> 2] = a;
        f[n + 8 >> 2] = 24;
        g = n + 12 | 0;
        h = n + 16 | 0;
        i = n + 20 | 0;
        j = n + 24 | 0;
        k = n + 28 | 0;
        l = n + 32 | 0;
        m = n + 40 | 0;
        a = Hc(p, c) | 0;
        c = g;
        e = c + 40 | 0;
        do {
            f[c >> 2] = 0;
            c = c + 4 | 0;
        } while ((c | 0) < (e | 0));
        d[g + 40 >> 1] = 0;
        b[g + 42 >> 0] = 0;
        a:
            do
                if (a) {
                    f[n + 48 >> 2] = 1;
                    xa[f[(f[p >> 2] | 0) + 20 >> 2] & 3](p, n, o, o, 1, 0);
                    a = (f[j >> 2] | 0) == 1 ? o : 0;
                } else {
                    wa[f[(f[p >> 2] | 0) + 24 >> 2] & 3](p, n, o, 1, 0);
                    switch (f[n + 36 >> 2] | 0) {
                    case 0: {
                            a = (f[m >> 2] | 0) == 1 & (f[k >> 2] | 0) == 1 & (f[l >> 2] | 0) == 1 ? f[i >> 2] | 0 : 0;
                            break a;
                        }
                    case 1:
                        break;
                    default: {
                            a = 0;
                            break a;
                        }
                    }
                    if ((f[j >> 2] | 0) != 1 ? !((f[m >> 2] | 0) == 0 & (f[k >> 2] | 0) == 1 & (f[l >> 2] | 0) == 1) : 0) {
                        a = 0;
                        break;
                    }
                    a = f[h >> 2] | 0;
                }
            while (0);
        u = q;
        return a | 0;
    }
    function Mc(a) {
        a = a | 0;
        Qc(a);
        return;
    }
    function Nc(a, b, c, d, e, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        if (Hc(a, f[b + 8 >> 2] | 0) | 0)
            Kc(b, c, d, e);
        else {
            a = f[a + 8 >> 2] | 0;
            xa[f[(f[a >> 2] | 0) + 20 >> 2] & 3](a, b, c, d, e, g);
        }
        return;
    }
    function Oc(a, c, d, e, g) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        g = g | 0;
        var h = 0, i = 0, j = 0;
        do
            if (!(Hc(a, f[c + 8 >> 2] | 0) | 0)) {
                if (!(Hc(a, f[c >> 2] | 0) | 0)) {
                    i = f[a + 8 >> 2] | 0;
                    wa[f[(f[i >> 2] | 0) + 24 >> 2] & 3](i, c, d, e, g);
                    break;
                }
                if ((f[c + 16 >> 2] | 0) != (d | 0) ? (h = c + 20 | 0, (f[h >> 2] | 0) != (d | 0)) : 0) {
                    f[c + 32 >> 2] = e;
                    i = c + 44 | 0;
                    if ((f[i >> 2] | 0) == 4)
                        break;
                    e = c + 52 | 0;
                    b[e >> 0] = 0;
                    j = c + 53 | 0;
                    b[j >> 0] = 0;
                    a = f[a + 8 >> 2] | 0;
                    xa[f[(f[a >> 2] | 0) + 20 >> 2] & 3](a, c, d, d, 1, g);
                    if (b[j >> 0] | 0)
                        if (!(b[e >> 0] | 0)) {
                            e = 1;
                            a = 11;
                        } else
                            a = 15;
                    else {
                        e = 0;
                        a = 11;
                    }
                    do
                        if ((a | 0) == 11) {
                            f[h >> 2] = d;
                            j = c + 40 | 0;
                            f[j >> 2] = (f[j >> 2] | 0) + 1;
                            if ((f[c + 36 >> 2] | 0) == 1 ? (f[c + 24 >> 2] | 0) == 2 : 0) {
                                b[c + 54 >> 0] = 1;
                                if (e) {
                                    a = 15;
                                    break;
                                } else {
                                    e = 4;
                                    break;
                                }
                            }
                            if (e)
                                a = 15;
                            else
                                e = 4;
                        }
                    while (0);
                    if ((a | 0) == 15)
                        e = 3;
                    f[i >> 2] = e;
                    break;
                }
                if ((e | 0) == 1)
                    f[c + 32 >> 2] = 1;
            } else
                Jc(c, d, e);
        while (0);
        return;
    }
    function Pc(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        if (Hc(a, f[b + 8 >> 2] | 0) | 0)
            Ic(b, c, d);
        else {
            a = f[a + 8 >> 2] | 0;
            va[f[(f[a >> 2] | 0) + 28 >> 2] & 3](a, b, c, d);
        }
        return;
    }
    function Qc(a) {
        a = a | 0;
        oc(a);
        return;
    }
    function Rc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        var d = 0, e = 0;
        e = u;
        u = u + 16 | 0;
        d = e;
        f[d >> 2] = f[c >> 2];
        a = ta[f[(f[a >> 2] | 0) + 16 >> 2] & 1](a, b, d) | 0;
        if (a)
            f[c >> 2] = f[d >> 2];
        u = e;
        return a & 1 | 0;
    }
    function Sc(a) {
        a = a | 0;
        if (!a)
            a = 0;
        else
            a = (Lc(a, 80) | 0) != 0 & 1;
        return a | 0;
    }
    function Tc() {
    }
    function Uc(a, c, d) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0, h = 0;
        if ((d | 0) >= 8192)
            return pa(a | 0, c | 0, d | 0) | 0;
        h = a | 0;
        g = a + d | 0;
        if ((a & 3) == (c & 3)) {
            while (a & 3) {
                if (!d)
                    return h | 0;
                b[a >> 0] = b[c >> 0] | 0;
                a = a + 1 | 0;
                c = c + 1 | 0;
                d = d - 1 | 0;
            }
            d = g & -4 | 0;
            e = d - 64 | 0;
            while ((a | 0) <= (e | 0)) {
                f[a >> 2] = f[c >> 2];
                f[a + 4 >> 2] = f[c + 4 >> 2];
                f[a + 8 >> 2] = f[c + 8 >> 2];
                f[a + 12 >> 2] = f[c + 12 >> 2];
                f[a + 16 >> 2] = f[c + 16 >> 2];
                f[a + 20 >> 2] = f[c + 20 >> 2];
                f[a + 24 >> 2] = f[c + 24 >> 2];
                f[a + 28 >> 2] = f[c + 28 >> 2];
                f[a + 32 >> 2] = f[c + 32 >> 2];
                f[a + 36 >> 2] = f[c + 36 >> 2];
                f[a + 40 >> 2] = f[c + 40 >> 2];
                f[a + 44 >> 2] = f[c + 44 >> 2];
                f[a + 48 >> 2] = f[c + 48 >> 2];
                f[a + 52 >> 2] = f[c + 52 >> 2];
                f[a + 56 >> 2] = f[c + 56 >> 2];
                f[a + 60 >> 2] = f[c + 60 >> 2];
                a = a + 64 | 0;
                c = c + 64 | 0;
            }
            while ((a | 0) < (d | 0)) {
                f[a >> 2] = f[c >> 2];
                a = a + 4 | 0;
                c = c + 4 | 0;
            }
        } else {
            d = g - 4 | 0;
            while ((a | 0) < (d | 0)) {
                b[a >> 0] = b[c >> 0] | 0;
                b[a + 1 >> 0] = b[c + 1 >> 0] | 0;
                b[a + 2 >> 0] = b[c + 2 >> 0] | 0;
                b[a + 3 >> 0] = b[c + 3 >> 0] | 0;
                a = a + 4 | 0;
                c = c + 4 | 0;
            }
        }
        while ((a | 0) < (g | 0)) {
            b[a >> 0] = b[c >> 0] | 0;
            a = a + 1 | 0;
            c = c + 1 | 0;
        }
        return h | 0;
    }
    function Vc(a, c, d) {
        a = a | 0;
        c = c | 0;
        d = d | 0;
        var e = 0, g = 0, h = 0, i = 0;
        h = a + d | 0;
        c = c & 255;
        if ((d | 0) >= 67) {
            while (a & 3) {
                b[a >> 0] = c;
                a = a + 1 | 0;
            }
            e = h & -4 | 0;
            g = e - 64 | 0;
            i = c | c << 8 | c << 16 | c << 24;
            while ((a | 0) <= (g | 0)) {
                f[a >> 2] = i;
                f[a + 4 >> 2] = i;
                f[a + 8 >> 2] = i;
                f[a + 12 >> 2] = i;
                f[a + 16 >> 2] = i;
                f[a + 20 >> 2] = i;
                f[a + 24 >> 2] = i;
                f[a + 28 >> 2] = i;
                f[a + 32 >> 2] = i;
                f[a + 36 >> 2] = i;
                f[a + 40 >> 2] = i;
                f[a + 44 >> 2] = i;
                f[a + 48 >> 2] = i;
                f[a + 52 >> 2] = i;
                f[a + 56 >> 2] = i;
                f[a + 60 >> 2] = i;
                a = a + 64 | 0;
            }
            while ((a | 0) < (e | 0)) {
                f[a >> 2] = i;
                a = a + 4 | 0;
            }
        }
        while ((a | 0) < (h | 0)) {
            b[a >> 0] = c;
            a = a + 1 | 0;
        }
        return h - d | 0;
    }
    function Wc(a) {
        a = a | 0;
        var b = 0, c = 0;
        c = f[r >> 2] | 0;
        b = c + a | 0;
        if ((a | 0) > 0 & (b | 0) < (c | 0) | (b | 0) < 0) {
            ca() | 0;
            oa(12);
            return -1;
        }
        f[r >> 2] = b;
        if ((b | 0) > (ba() | 0) ? (aa() | 0) == 0 : 0) {
            f[r >> 2] = c;
            oa(12);
            return -1;
        }
        return c | 0;
    }
    function Xc(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        return sa[a & 0](b | 0, c | 0) | 0;
    }
    function Yc(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        return ta[a & 1](b | 0, c | 0, d | 0) | 0;
    }
    function Zc(a, b) {
        a = a | 0;
        b = b | 0;
        ua[a & 7](b | 0);
    }
    function _c(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        va[a & 3](b | 0, c | 0, d | 0, e | 0);
    }
    function $c(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        wa[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0);
    }
    function ad(a, b, c, d, e, f, g) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        g = g | 0;
        xa[a & 3](b | 0, c | 0, d | 0, e | 0, f | 0, g | 0);
    }
    function bd(a, b) {
        a = a | 0;
        b = b | 0;
        _(0);
        return 0;
    }
    function cd(a, b, c) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        _(1);
        return 0;
    }
    function dd(a) {
        a = a | 0;
        _(2);
    }
    function ed(a, b, c, d) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        _(3);
    }
    function fd(a, b, c, d, e) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        _(4);
    }
    function gd(a, b, c, d, e, f) {
        a = a | 0;
        b = b | 0;
        c = c | 0;
        d = d | 0;
        e = e | 0;
        f = f | 0;
        _(5);
    }
    var sa = [bd];
    var ta = [
        cd,
        Dc
    ];
    var ua = [
        dd,
        zc,
        Ac,
        Bc,
        Cc,
        Mc,
        dd,
        dd
    ];
    var va = [
        ed,
        Gc,
        Pc,
        ed
    ];
    var wa = [
        fd,
        Fc,
        Oc,
        fd
    ];
    var xa = [
        gd,
        Ec,
        Nc,
        gd
    ];
    return {
        ___cxa_can_catch: Rc,
        ___cxa_is_pointer_type: Sc,
        ___emscripten_environ_constructor: uc,
        __get_daylight: wc,
        __get_environ: yc,
        __get_timezone: xc,
        __get_tzname: vc,
        _bidi_getLine: La,
        _bidi_getParagraphEndIndex: Ha,
        _bidi_getVisualRun: Ia,
        _bidi_processText: Ga,
        _bidi_setLine: Ja,
        _bidi_writeReverse: Ka,
        _emscripten_replace_memory: ra,
        _free: oc,
        _malloc: nc,
        _memalign: sc,
        _memcpy: Uc,
        _memset: Vc,
        _sbrk: Wc,
        _ushape_arabic: Fa,
        dynCall_iii: Xc,
        dynCall_iiii: Yc,
        dynCall_vi: Zc,
        dynCall_viiii: _c,
        dynCall_viiiii: $c,
        dynCall_viiiiii: ad,
        establishStackSpace: Ba,
        getTempRet0: Ea,
        runPostSets: Tc,
        setTempRet0: Da,
        setThrew: Ca,
        stackAlloc: ya,
        stackRestore: Aa,
        stackSave: za
    };
}(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var ___cxa_can_catch = Module['___cxa_can_catch'] = asm['___cxa_can_catch'];
var ___cxa_is_pointer_type = Module['___cxa_is_pointer_type'] = asm['___cxa_is_pointer_type'];
var ___emscripten_environ_constructor = Module['___emscripten_environ_constructor'] = asm['___emscripten_environ_constructor'];
var __get_daylight = Module['__get_daylight'] = asm['__get_daylight'];
var __get_environ = Module['__get_environ'] = asm['__get_environ'];
var __get_timezone = Module['__get_timezone'] = asm['__get_timezone'];
var __get_tzname = Module['__get_tzname'] = asm['__get_tzname'];
var _bidi_getLine = Module['_bidi_getLine'] = asm['_bidi_getLine'];
var _bidi_getParagraphEndIndex = Module['_bidi_getParagraphEndIndex'] = asm['_bidi_getParagraphEndIndex'];
var _bidi_getVisualRun = Module['_bidi_getVisualRun'] = asm['_bidi_getVisualRun'];
var _bidi_processText = Module['_bidi_processText'] = asm['_bidi_processText'];
var _bidi_setLine = Module['_bidi_setLine'] = asm['_bidi_setLine'];
var _bidi_writeReverse = Module['_bidi_writeReverse'] = asm['_bidi_writeReverse'];
var _emscripten_replace_memory = Module['_emscripten_replace_memory'] = asm['_emscripten_replace_memory'];
var _free = Module['_free'] = asm['_free'];
var _malloc = Module['_malloc'] = asm['_malloc'];
var _memalign = Module['_memalign'] = asm['_memalign'];
var _memcpy = Module['_memcpy'] = asm['_memcpy'];
var _memset = Module['_memset'] = asm['_memset'];
var _sbrk = Module['_sbrk'] = asm['_sbrk'];
var _ushape_arabic = Module['_ushape_arabic'] = asm['_ushape_arabic'];
var establishStackSpace = Module['establishStackSpace'] = asm['establishStackSpace'];
var getTempRet0 = Module['getTempRet0'] = asm['getTempRet0'];
var runPostSets = Module['runPostSets'] = asm['runPostSets'];
var setTempRet0 = Module['setTempRet0'] = asm['setTempRet0'];
var setThrew = Module['setThrew'] = asm['setThrew'];
var stackAlloc = Module['stackAlloc'] = asm['stackAlloc'];
var stackRestore = Module['stackRestore'] = asm['stackRestore'];
var stackSave = Module['stackSave'] = asm['stackSave'];
var dynCall_iii = Module['dynCall_iii'] = asm['dynCall_iii'];
var dynCall_iiii = Module['dynCall_iiii'] = asm['dynCall_iiii'];
var dynCall_vi = Module['dynCall_vi'] = asm['dynCall_vi'];
var dynCall_viiii = Module['dynCall_viiii'] = asm['dynCall_viiii'];
var dynCall_viiiii = Module['dynCall_viiiii'] = asm['dynCall_viiiii'];
var dynCall_viiiiii = Module['dynCall_viiiiii'] = asm['dynCall_viiiiii'];
Module['asm'] = asm;
Module['ccall'] = ccall;
Module['UTF16ToString'] = UTF16ToString;
Module['stringToUTF16'] = stringToUTF16;
if (memoryInitializer) {
    if (!isDataURI(memoryInitializer)) {
        if (typeof Module['locateFile'] === 'function') {
            memoryInitializer = Module['locateFile'](memoryInitializer);
        } else if (Module['memoryInitializerPrefixURL']) {
            memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
        }
    }
    if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
        var data = Module['readBinary'](memoryInitializer);
        HEAPU8.set(data, GLOBAL_BASE);
    } else {
        addRunDependency('memory initializer');
        var applyMemoryInitializer = function (data) {
            if (data.byteLength)
                data = new Uint8Array(data);
            HEAPU8.set(data, GLOBAL_BASE);
            if (Module['memoryInitializerRequest'])
                delete Module['memoryInitializerRequest'].response;
            removeRunDependency('memory initializer');
        };
        function doBrowserLoad() {
            Module['readAsync'](memoryInitializer, applyMemoryInitializer, function () {
                throw 'could not load memory initializer ' + memoryInitializer;
            });
        }
        var memoryInitializerBytes = tryParseAsDataURI(memoryInitializer);
        if (memoryInitializerBytes) {
            applyMemoryInitializer(memoryInitializerBytes.buffer);
        } else if (Module['memoryInitializerRequest']) {
            function useRequest() {
                var request = Module['memoryInitializerRequest'];
                var response = request.response;
                if (request.status !== 200 && request.status !== 0) {
                    var data = tryParseAsDataURI(Module['memoryInitializerRequestURL']);
                    if (data) {
                        response = data.buffer;
                    } else {
                        console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
                        doBrowserLoad();
                        return;
                    }
                }
                applyMemoryInitializer(response);
            }
            if (Module['memoryInitializerRequest'].response) {
                setTimeout(useRequest, 0);
            } else {
                Module['memoryInitializerRequest'].addEventListener('load', useRequest);
            }
        } else {
            doBrowserLoad();
        }
    }
}
function ExitStatus(status) {
    this.name = 'ExitStatus';
    this.message = 'Program terminated with exit(' + status + ')';
    this.status = status;
}
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;
var initialStackTop;
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

function processBidirectionalText(input, lineBreakPoints) {
    var nDataBytes = (input.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    var paragraphCount = setParagraph(input, stringInputPtr, nDataBytes);
    if (!paragraphCount) {
        return [input];
    }

    var mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    var startIndex = 0;
    var lines = [];

    for (var i = 0, list = mergedParagraphLineBreakPoints; i < list.length; i += 1) {
        var lineBreakPoint = list[i];

        var returnStringPtr = Module.ccall('bidi_getLine', 'number', ['number', 'number'], [startIndex, lineBreakPoint]);

        if (returnStringPtr === 0) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        lines.push(Module.UTF16ToString(returnStringPtr));
        Module._free(returnStringPtr);

        startIndex = lineBreakPoint;
    }

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}

function createInt32Ptr() {
    return Module._malloc(4);
}

function readInt32Ptr(ptr) {
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

function processStyledBidirectionalText(text, styleIndices, lineBreakPoints) {
    var nDataBytes = (text.length + 1) * 2;
    var stringInputPtr = Module._malloc(nDataBytes);
    var paragraphCount = setParagraph(text, stringInputPtr, nDataBytes);
    if (!paragraphCount) {
        return [{text: text, styleIndices: styleIndices}];
    }

    var mergedParagraphLineBreakPoints = mergeParagraphLineBreakPoints(lineBreakPoints, paragraphCount);

    var startIndex = 0;
    var lines = [];

    for (var i$1 = 0, list = mergedParagraphLineBreakPoints; i$1 < list.length; i$1 += 1) {
        var lineBreakPoint = list[i$1];

        var lineText = "";
        var lineStyleIndices = [];
        var runCount = Module.ccall('bidi_setLine', 'number', ['number', 'number'], [startIndex, lineBreakPoint]);

        if (!runCount) {
            Module._free(stringInputPtr);
            return []; // TODO: throw exception?
        }

        for (var i = 0; i < runCount; i++) {
            var logicalStartPtr = createInt32Ptr();
            var logicalLengthPtr = createInt32Ptr();
            var isReversed = Module.ccall('bidi_getVisualRun', 'number', ['number', 'number', 'number'], [i, logicalStartPtr, logicalLengthPtr]);

            var logicalStart = startIndex + readInt32Ptr(logicalStartPtr);
            var logicalLength = readInt32Ptr(logicalLengthPtr);
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
        startIndex = lineBreakPoint;
    }

    Module._free(stringInputPtr); // Input string must live until getLine calls are finished

    return lines;
}

self.registerRTLTextPlugin({'applyArabicShaping': applyArabicShaping, 'processBidirectionalText': processBidirectionalText, 'processStyledBidirectionalText': processStyledBidirectionalText});
})();
