    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/Apple-Watch-Game/sw.js').then(reg => reg.update());
    }
