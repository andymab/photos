<template>
    <div class="app">
        <header class="app-header">
            <div class="logo-circle">📷</div>
            <h1>Фотоальбомы</h1>
        </header>
        <main class="app-main">
            <router-view />
        </main>
    </div>
</template>


<script setup lang="ts"></script>


<style scoped>
.app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

.app-header {
    padding: 16px 20px;
    color: #fff;
    display: flex;
    gap: 12px;
    align-items: center;
}

.logo-circle {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.15);
    display: grid;
    place-items: center;
}

.app-main {
    flex: 1;
    padding: 20px;
}
</style>
