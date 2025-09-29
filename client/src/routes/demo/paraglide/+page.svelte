<script lang="ts">
import { goto } from "$app/navigation";
import { page } from "$app/stores";
import * as m from "$lib/paraglide/messages.js";
import {
    getLocale,
    locales,
    localizeHref,
} from "$lib/paraglide/runtime";

function switchToLanguage(newLanguage: string) {
    const localisedPath = localizeHref(page.url.pathname, { locale: newLanguage });
    goto(localisedPath);
}
</script>

<h1>Paraglide Demo</h1>
<div>
    <p>Current locale: {getLocale()}</p>
    <p>{m.hello_world({ name: "World" })}</p>

    <h2>Switch Language</h2>
    {#each locales as lang}
        <button
            onclick={() => switchToLanguage(lang)}
            disabled={lang === getLocale()}
        >
            {lang}
        </button>
    {/each}

    <h2>Temporary Page Messages</h2>
    <p>{m.temporary_page_notice()}</p>
    <button>{m.temporary_page_create_button()}</button>
    <button>{m.temporary_page_cancel_button()}</button>
</div>
