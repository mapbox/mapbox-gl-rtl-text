if (module) {
    exports = module.exports; // Necessary because emscripten may reassign module.exports
}
exports.applyArabicShaping = applyArabicShaping;
exports.processBidirectionalText = processBidirectionalText;
exports.processStyledBidirectionalText = processStyledBidirectionalText;

});
