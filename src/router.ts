//src\router.ts

const { createRouter, createWebHistory } = (window as any).VueRouter;
import AlbumsView from './Views/AlbumsView.vue';
import AlbumView from './Views/AlbumView.vue';
import ImportView from './Views/ImportView.vue';


const routes = [
{ path: '/', name: 'albums', component: AlbumsView },
{ path: '/album/:id', name: 'album', component: AlbumView, props: true },
{ path: '/import/:id', name: 'import', component: ImportView, props: true },
];


export default createRouter({ history: createWebHistory(), routes });