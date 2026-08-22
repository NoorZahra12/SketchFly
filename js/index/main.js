import { createProject, saveProject, getAllProjects } from "../projects.js";

document.addEventListener("DOMContentLoaded", () => {

    // ----------------------CTA & NAVBAR ----------------------------------
    // UI interactions:nav selection + CTA visibility + fragments loading
    const navButtons = [...document.querySelectorAll(".nav-btn")];
    const defaultSection = document.getElementById("default-section");
    const contentContainer = document.getElementById("content-container");
    const ctaNav = document.querySelector(".cta-animate");
    const logo = document.querySelector(".logo");

    if (logo) {
        logo.addEventListener("click", () => {
            undoNavSelection(navButtons);
            defaultSection.classList.remove("hidden");
            contentContainer.classList.add("hidden");
            updateWhereCTA(navButtons, ctaNav);
        });
    }

    navButtons.forEach((btn) => {
        btn.addEventListener("click", async () => {
            const isActive = btn.classList.contains("active");
            undoNavSelection(navButtons);
            if (!isActive) {
                btn.classList.add("active");

                const target = btn.dataset.section;
                if (target) {
                    await loadFragment(target, contentContainer);
                }

                defaultSection.classList.add("hidden");
                contentContainer.classList.remove("hidden");
            } else {
                defaultSection.classList.remove("hidden");
                contentContainer.classList.add("hidden");
            }
            updateWhereCTA(navButtons, ctaNav);
        });
    });



    //CTA function
    document
        .querySelectorAll(".cta")
        .forEach((btn) =>
            btn.addEventListener("click", () =>
                openModal("indexAssets/components/modal.html"),
            ),
        );

    function undoNavSelection(navButtons) {
        // this removes the active class from the nav btns
        navButtons.forEach((b) => b.classList.remove("active"));
    }
    function updateWhereCTA(navButtons, ctaNav) {
        if (!ctaNav) {
            return;
        }
        const anyActive = navButtons.some((b) => b.classList.contains("active"));
        const isHidden = ctaNav.classList.contains("hidden");
        if (anyActive && isHidden) {
            ctaNav.classList.remove("hidden");
            ctaNav.style.opacity = "0";
            ctaNav.style.transform = "translateX(40px)";

            anime({
                targets: ctaNav,
                translateX: [40, 0],
                opacity: [0, 1],
                duration: 450,
                easing: "easeOutQuad",
                complete: () => {
                    ctaNav.style.transform = "";
                    ctaNav.style.opacity = "";
                },
            });
        } else if (!anyActive && !isHidden) {
            anime({
                targets: ctaNav,
                translateX: [0, 40],
                opacity: [1, 0],
                duration: 350,
                easing: "easeOutQuad",
                complete: () => {
                    ctaNav.classList.add("hidden");
                    ctaNav.style.transform = "";
                    ctaNav.style.opacity = "";
                },
            });
        }
    }

    async function loadFragment(sectionName, contentContainer) {
        try {
            console.log(`Loading fragment for ${sectionName}`);
            // path is ./indexAssets/pages/${sectionName}.html
            const response = await fetch(
                `./indexAssets/pages/${sectionName}.html`,
            );
            if (!response.ok) throw new Error(`Failed to load ${sectionName}`);
            const html = await response.text();
            contentContainer.innerHTML = html;
            console.log(`Fetched HTML for ${sectionName}:`, html);
            console.log(
                `Set innerHTML for ${sectionName}, current content:`,
                contentContainer.innerHTML,
            );

            // If loading gallery, display projects
            if (sectionName === "settings") {
                attachSettingsFunctions();
            } else if (sectionName === "gallery") {
                attachGalleryFunctions(contentContainer);
            }
        } catch (error) {
            console.error(error);
            contentContainer.innerHTML = `<p>Error loading ${sectionName}.</p>`;
        }
    }
















    // -----------------------------Modal----------------------------
    function openModal(formPath) {
        // overlay
        const overlay = document.createElement("div");
        overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.45);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

        const modal = document.createElement("div");
        modal.style.cssText = `
        position: relative;
        z-index: 1000000;
        width: auto;
        max-width: 90vw;
        max-height: 90vh;
        background: white;
        border-radius: 8px;
        overflow: auto;
    `;

        overlay.appendChild(modal);

        // Fetching the modal html from components
        fetch(formPath)
            .then((res) => res.text())
            .then((html) => {
                modal.innerHTML = html;
                const closeBtn = modal.querySelector("#close-btn");
                if (closeBtn) {
                    closeBtn.addEventListener("click", () => closeModal(overlay));
                }

                // Attach make project handler
                const makeBtn = modal.querySelector("#make-project-btn");
                if (makeBtn) {
                    makeBtn.addEventListener("click", async () => {
                        const get = (sel) => modal.querySelector(sel)?.value ?? "";
                        const project = createProject(
                            get("#project-name") || "Untitled Project",
                            {
                                CANVAS_WIDTH: Number(get("#canvas-width")) || 800,
                                CANVAS_HEIGHT: Number(get("#canvas-height")) || 600,
                                FPS: Number(get("#fps-value")) || 12,
                            },
                        );
                        await saveProject(project);
                        closeModal(overlay);
                        window.location.href = `editor.html?id=${encodeURIComponent(project.id)}`;
                    });
                }
            })
            .catch((err) => {
                console.error("Error loading form:", err);
                modal.innerHTML = "<p>Error loading form.</p>";
            });

        // Append to body (highest stacking context)
        document.body.appendChild(overlay);
    }
    // triggered by cta btn

    function closeModal(overlay) {
        if (overlay) {
            overlay.style.opacity = "0";
            overlay.style.transition = "opacity 0.3s ease";
            setTimeout(() => overlay.remove(), 300);
        }
    }

















    // ------------------------ Check Theme -----------------------------------------
    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark");
    }

    // ------------------------ Settings functions -----------------------------------------
    function attachSettingsFunctions() {
        const toggleButton = document.querySelector(".toggle");
        if (toggleButton) {
            // theme
            if (localStorage.getItem("theme") === "dark") {
                document.body.classList.add("dark");
                // update the button's content n show moon icon
            }
            toggleButton.addEventListener("click", () => {
                const dark = document.body.classList.toggle("dark");
                localStorage.setItem("theme", dark ? "dark" : "light");
            });
        }
    }


    // ------------------------ Gallery functions -----------------------------------------
    async function attachGalleryFunctions(container) {
        const scroller = container.querySelector('.scroller');
        if (!scroller) {
            console.error("Scroller not found in gallery fragment");
            return;
        }

        scroller.innerHTML = '';

        try {
            const projects = await getAllProjects();
            const templateResponse = await fetch('./indexAssets/components/projectCard.html');
            const template = await templateResponse.text();

            projects.forEach(project => {
                const wrapper = document.createElement('div');
                wrapper.innerHTML = template;
                wrapper.querySelectorAll('style').forEach(style => {
                    if (!document.head.contains(style)) {
                        document.head.appendChild(style);
                    }
                });
                const projectCard = wrapper.querySelector('.project-card');
                // replace text content
                projectCard.querySelector('.project-name').textContent = project.name;
                projectCard.querySelector('.currentfpsIndicator').textContent = `${project.fps} FPS`;
                projectCard.querySelector('.timedisplay').textContent = project.duration;
                projectCard.dataset.projectId = project.id;
                const thumbnail = projectCard.querySelector('.thumbnail');
                if (project.thumbnail) {
                    const image = document.createElement('img');
                    image.loading = 'lazy';
                    image.alt = `${project.name} first frame`;
                    image.src = URL.createObjectURL(new Blob([project.thumbnail], { type: 'image/png' }));
                    image.onload = () => URL.revokeObjectURL(image.src);
                    thumbnail.appendChild(image);
                }
                thumbnail.addEventListener('click', () => {
                    window.location.href = `editor.html?id=${encodeURIComponent(project.id)}`;
                });
                scroller.appendChild(projectCard);
            });


        } catch (error) {
            console.error(error);
            scroller.innerHTML = '<p>Error loading projects.</p>';
        }
    }





    // ------------------------ Gradient cursor follow -----------------------------
    const interBubble = document.querySelector(".interactive");
    const interSmall = document.querySelector(".interactive-small");
    if (interBubble) {
        let curX = 0;
        let curY = 0;
        let tgX = 0;
        let tgY = 0;
        let curX2 = 0;
        let curY2 = 0;

        const move = () => {
            curX += (tgX - curX) / 18;
            curY += (tgY - curY) / 18;
            interBubble.style.transform = `translate(${Math.round(curX)}px, ${Math.round(curY)}px)`;
            if (interSmall) {
                curX2 += (tgX - curX2) / 10;
                curY2 += (tgY - curY2) / 10;
                interSmall.style.transform = `translate(${Math.round(curX2)}px, ${Math.round(curY2)}px)`;
            }
            requestAnimationFrame(move);
        };

        window.addEventListener("pointermove", (event) => {
            tgX = event.clientX;
            tgY = event.clientY;
        });

        move();
    }

    // ------------------------ CTA ripple hover -----------------------------
    document.querySelectorAll(".cta").forEach((btn) => {
        const ripple = document.createElement("span");
        ripple.className = "cta-ripple";
        btn.appendChild(ripple);

        const placeRipple = (event) => {
            const rect = btn.getBoundingClientRect();
            const relX = event.clientX - rect.left;
            const relY = event.clientY - rect.top;
            ripple.style.left = `${relX}px`;
            ripple.style.top = `${relY}px`;
        };

        btn.addEventListener("pointerenter", placeRipple);
        btn.addEventListener("pointermove", placeRipple);
        btn.addEventListener("pointerleave", placeRipple);
    });

});
