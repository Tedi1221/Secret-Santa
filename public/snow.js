document.addEventListener("DOMContentLoaded", () => {
    const snowContainer = document.createElement("div");
    snowContainer.className = "snow-container";
    document.body.appendChild(snowContainer);

    for (let i = 0; i < 80; i++) {
        let snow = document.createElement("div");
        snow.className = "snowflake";
        snow.style.left = Math.random() * 100 + "vw";
        snow.style.animationDuration = 4 + Math.random() * 6 + "s";
        snow.style.opacity = Math.random();
        snowContainer.appendChild(snow);
    }
});
