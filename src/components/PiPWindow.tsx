import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface PiPWindowProps {
  children: React.ReactNode;
  pipWindow: Window;
}

export default function PiPWindow({ children, pipWindow }: PiPWindowProps) {
  useEffect(() => {
    const copyStyles = () => {
      [...document.styleSheets].forEach((styleSheet) => {
        try {
          if (styleSheet.cssRules) {
            const newStyleEl = pipWindow.document.createElement('style');
            [...styleSheet.cssRules].forEach((cssRule) => {
              newStyleEl.appendChild(pipWindow.document.createTextNode(cssRule.cssText));
            });
            pipWindow.document.head.appendChild(newStyleEl);
          } else if (styleSheet.href) {
            const newLinkEl = pipWindow.document.createElement('link');
            newLinkEl.rel = 'stylesheet';
            newLinkEl.href = styleSheet.href;
            pipWindow.document.head.appendChild(newLinkEl);
          }
        } catch (e) {
          // Ignored
        }
      });
      pipWindow.document.documentElement.className = document.documentElement.className;
      pipWindow.document.body.className = 'bg-black text-white h-full w-full m-0 p-0 overflow-hidden';
    };
    
    copyStyles();
  }, [pipWindow]);

  return createPortal(children, pipWindow.document.body);
}
