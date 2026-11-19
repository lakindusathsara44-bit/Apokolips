(() => {
  "use strict";

  const pages = [
    {
      title: "About Me",
      description: "Profile, background, skills, education, and contact details.",
      keywords: "about profile Lakindu Sathsara student SLIATE HNDIT education skills contact",
      href: "./info.html",
      category: "PAGES",
    },
    {
      title: "My Projects",
      description: "Explore the software projects and learning platforms built through Apokolips.",
      keywords: "projects portfolio Tenses English grammar Constantine Vajrapani Buddhism Catholic GPA calculator SLIATE HNDIT NervaEdu Apokolips Search NEXIST Quantum QAOA qubits AI intelligence",
      href: "./My-project.html",
      category: "PROJECTS",
    },
    {
      title: "Community Gallery",
      description: "Discover projects, ideas, and creations shared by the community.",
      keywords: "community gallery creations Nexlymate Vishwa Dasun innovation",
      href: "./project.gallery.html",
      category: "COMMUNITY",
    },
    {
      title: "Apokolips Blog",
      description: "Read updates, articles, notes, and announcements.",
      keywords: "blog articles updates posts announcements writing",
      href: "./blog.html",
      category: "READ",
    },
    {
      title: "Network Folder",
      description: "Open the shared file area for documents and media.",
      keywords: "network folder shared files downloads documents media upload",
      href: "./network-folder.html",
      category: "TOOLS",
    },
    {
      title: "Community Chat",
      description: "Visit the Apokolips community conversation space.",
      keywords: "chat community discussion messages members conversation",
      href: "./Community.chat.html",
      category: "COMMUNITY",
    },
  ];

  const normalize = (value) =>
    value
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "");

  function mountSearch() {
    const hero = document.querySelector(".hero-wrap");
    const actions = hero && hero.querySelector(".hero-actions");
    if (!actions || hero.querySelector(".site-search")) return Boolean(actions);

    const section = document.createElement("section");
    section.className = "site-search";
    section.setAttribute("aria-label", "Search the Apokolips website");
    section.innerHTML = `
      <form class="site-search-form" role="search">
        <span class="site-search-icon" aria-hidden="true"></span>
        <label class="site-search-sr-only" for="apokolips-site-search">Search Apokolips</label>
        <input
          id="apokolips-site-search"
          type="search"
          name="q"
          maxlength="80"
          autocomplete="off"
          placeholder="Search projects, pages, and resources..."
          aria-controls="apokolips-site-search-results"
          aria-expanded="false"
        />
        <button type="submit">Search <span aria-hidden="true">↗</span></button>
      </form>
      <div
        class="site-search-results"
        id="apokolips-site-search-results"
        role="listbox"
        aria-label="Website search results"
        hidden
      ></div>
      <p class="site-search-hint">SEARCH THE APOKOLIPS DIRECTORY</p>
    `;

    actions.insertAdjacentElement("afterend", section);

    const form = section.querySelector("form");
    const input = section.querySelector("input");
    const results = section.querySelector(".site-search-results");

    function findMatches(query) {
      const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];

      return pages
        .map((page) => {
          const title = normalize(page.title);
          const description = normalize(page.description);
          const keywords = normalize(page.keywords);
          const searchable = title + " " + description + " " + keywords;
          if (!terms.every((term) => searchable.includes(term))) return null;

          const score = terms.reduce((total, term) => {
            if (title.includes(term)) return total + 6;
            if (keywords.includes(term)) return total + 3;
            if (description.includes(term)) return total + 2;
            return total;
          }, 0);
          return { ...page, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, 5);
    }

    function closeResults() {
      results.hidden = true;
      results.replaceChildren();
      input.setAttribute("aria-expanded", "false");
    }

    function renderResults() {
      const query = input.value.trim();
      if (!query) {
        closeResults();
        return [];
      }

      const matches = findMatches(query);
      results.replaceChildren();

      if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "site-search-empty";
        empty.textContent = "No matching pages. Try a project name or topic.";
        results.append(empty);
      } else {
        for (const page of matches) {
          const link = document.createElement("a");
          link.className = "site-search-result";
          link.href = page.href;
          link.setAttribute("role", "option");

          const copy = document.createElement("span");
          copy.className = "site-search-result-copy";

          const title = document.createElement("strong");
          title.textContent = page.title;

          const description = document.createElement("small");
          description.textContent = page.description;

          const category = document.createElement("span");
          category.className = "site-search-result-category";
          category.textContent = page.category;

          copy.append(title, description);
          link.append(copy, category);
          results.append(link);
        }
      }

      results.hidden = false;
      input.setAttribute("aria-expanded", "true");
      return matches;
    }

    input.addEventListener("input", renderResults);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const matches = renderResults();
      if (matches.length) window.location.assign(matches[0].href);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeResults();
    });
    document.addEventListener("click", (event) => {
      if (!section.contains(event.target)) closeResults();
    });

    return true;
  }

  if (mountSearch()) return;

  const observer = new MutationObserver(() => {
    if (mountSearch()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
