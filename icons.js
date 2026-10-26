/* Hand-drawn style line icons for the timeline. Use the key in config.js → schedule.items[].icon */
window.TIMELINE_ICONS = {
  glasses:
    '<path d="M32 2.5v3.6M27.4 4l1.8 2.6M36.6 4l-1.8 2.6"/>' +
    '<g transform="translate(28.2 11) rotate(18)">' +
      '<path d="M-5.2 0H5.2L4.3 17.5Q0 23.5-4.3 17.5Z"/><path d="M-4.8 7.5H4.8" opacity=".55"/>' +
      '<path d="M0 21.2V41"/><ellipse cx="0" cy="42" rx="6.5" ry="1.7"/>' +
      '<circle cx="-1.5" cy="12" r=".7"/><circle cx="1.6" cy="15" r=".6"/>' +
    '</g>' +
    '<g transform="translate(35.8 11) rotate(-18)">' +
      '<path d="M-5.2 0H5.2L4.3 17.5Q0 23.5-4.3 17.5Z"/><path d="M-4.8 7.5H4.8" opacity=".55"/>' +
      '<path d="M0 21.2V41"/><ellipse cx="0" cy="42" rx="6.5" ry="1.7"/>' +
      '<circle cx="1.2" cy="11.5" r=".7"/><circle cx="-1.4" cy="14.5" r=".6"/>' +
    '</g>',

  couple:
    /* bride */
    '<circle cx="23" cy="13" r="4.3"/>' +
    '<path d="M20 9.5Q13 22 10 54"/>' +
    '<path d="M21 21.5Q23.5 19.5 26 21.5L27.5 33Q31 45 34 54H13Q16.5 44 19.5 33Z"/>' +
    '<path d="M19.5 33Q23.5 35 27.5 33"/>' +
    '<circle cx="26.5" cy="30" r="2"/><circle cx="29.3" cy="31.8" r="1.8"/><circle cx="26.8" cy="33.6" r="1.6"/>' +
    '<path d="M27 35.2l-1 4M28.4 35l1.6 3.6"/>' +
    /* groom */
    '<circle cx="41" cy="11.5" r="4.3"/><path d="M37.2 9.6Q41 5.5 44.8 9.6"/>' +
    '<path d="M35 21.5Q41 18.5 47 21.5L47.8 38H34.2Z"/>' +
    '<path d="M39 20l2 9 2-9"/><path d="M39.6 21.3l1.4.8 1.4-.8"/>' +
    '<path d="M34.6 38L35.4 53.5H39.6L41 41.5L42.4 53.5H46.6L47.4 38"/>' +
    '<path d="M35 54.2h4.8M42.2 54.2H47"/>' +
    '<path d="M35.2 23.5Q31.5 28.5 29.5 29.5"/>',

  cake:
    '<path d="M6 55H58"/><path d="M9 52.5Q32 56.5 55 52.5"/>' +
    '<rect x="12" y="40" width="40" height="12.5" rx="2"/>' +
    '<rect x="17.5" y="29" width="29" height="11" rx="2"/>' +
    '<rect x="23" y="19" width="18" height="10" rx="2"/>' +
    '<path d="M12.5 44q3.9 3 7.8 0t7.8 0 7.8 0 7.8 0 7.8 0" opacity=".6"/>' +
    '<path d="M18 32.5q3.6 2.6 7.2 0t7.2 0 7.2 0 7.2 0" opacity=".6"/>' +
    /* topper flower + leaves */
    '<circle cx="32" cy="14.2" r="2.6"/><path d="M32 12.6a1.2 1.2 0 1 1-.1 0"/>' +
    '<path d="M29.5 15.5q-3.5-.5-4.5-3 3 0 4.5 2M34.5 15.5q3.5-.5 4.5-3-3 0-4.5 2"/>' +
    /* roses on tiers */
    '<circle cx="20" cy="47.5" r="2.1"/><circle cx="32" cy="48" r="2.4"/><circle cx="44" cy="47.5" r="2.1"/>' +
    '<circle cx="25.5" cy="36" r="1.8"/><circle cx="38.5" cy="36" r="1.8"/>' +
    '<circle cx="32" cy="24.5" r="1.7"/>' +
    '<path d="M22.5 48.5q1.5 1.5 3 .5M41.5 48.5q-1.5 1.5-3 .5M28 36.5q1.5 1.3 3 .3M36 36.5q-1.5 1.3-3 .3"/>',

  cloche:
    '<circle cx="30" cy="10.5" r="2.3"/>' +
    '<path d="M11 33Q11 13 30 13Q49 13 49 33"/>' +
    '<path d="M17 28Q17.5 20.5 24 17.5" opacity=".55"/>' +
    '<path d="M6 33.5H54"/><path d="M8 33.5Q9 37 12 37H48Q51 37 52 33.5"/>' +
    /* hand underneath, sleeve to the right */
    '<path d="M20 37.5Q18.5 41.5 22 42H40"/>' +
    '<path d="M24 42Q22 45.5 26 46H41"/>' +
    '<path d="M40 41.5L44 41M41 46L45 45.5"/>' +
    '<path d="M44 39.5L50.5 37.8L54.5 49L48 50.8Z"/>' +
    '<path d="M50.5 37.8L58 35.5M54.5 49L60 47"/>',

  car:
    '<path d="M11 43V31Q11 25 17 23.5L21.5 12.5Q22.6 9.5 26 9.5H38Q41.4 9.5 42.5 12.5L47 23.5Q53 25 53 31V43"/>' +
    '<path d="M24 13H40L43.5 22.5H20.5Z"/>' +
    '<path d="M27 16.5q1.2-1.5 2.4 0M34.6 16.5q1.2-1.5 2.4 0" opacity=".6"/>' +
    '<circle cx="17" cy="31.5" r="3.2"/><circle cx="47" cy="31.5" r="3.2"/>' +
    '<rect x="23.5" y="28" width="17" height="10" rx="1.2"/>' +
    '<text x="32" y="32.3" text-anchor="middle" font-size="3.6" font-family="Georgia,serif" stroke="none" fill="currentColor">JUST</text>' +
    '<text x="32" y="36.4" text-anchor="middle" font-size="3.6" font-family="Georgia,serif" stroke="none" fill="currentColor">MARRIED</text>' +
    '<path d="M9 43H55V46.5H9Z"/>' +
    '<path d="M13.5 46.5V50H19.5V46.5M44.5 46.5V50H50.5V46.5"/>' +
    /* strings and tin cans */
    '<path d="M25 46.5Q22 52 17 55M32 46.5Q32.5 52 31 56M39 46.5Q42 51.5 46 55"/>' +
    '<g transform="translate(14.5 56.5) rotate(-35)"><rect x="-2.6" y="-1.8" width="5.2" height="3.6" rx=".6"/></g>' +
    '<g transform="translate(30.5 58.5) rotate(10)"><rect x="-2.6" y="-1.8" width="5.2" height="3.6" rx=".6"/></g>' +
    '<g transform="translate(48.5 56.5) rotate(30)"><rect x="-2.6" y="-1.8" width="5.2" height="3.6" rx=".6"/></g>'
};
