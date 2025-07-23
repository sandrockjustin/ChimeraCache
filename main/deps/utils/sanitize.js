sanitize(key) {
    return key.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
            .replace(/[\s.]+$/g, ''); 
}

module.exports = sanitize;