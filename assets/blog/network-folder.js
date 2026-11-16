import React from 'react';
import { createRoot } from 'react-dom/client';
import ShareFolder from '../../blog-app/src/ShareFolder.js';

const root = document.getElementById('network-folder-root');
if (!root) throw new Error('Network Folder root was not found.');

createRoot(root).render(React.createElement(ShareFolder));
