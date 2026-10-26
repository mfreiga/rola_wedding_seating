/*
 * ─────────────────────────────────────────────────────────────
 *  Wedding settings — edit the text here, no other file needed.
 *  Things marked TODO are placeholders waiting for real details.
 * ─────────────────────────────────────────────────────────────
 */
window.WEDDING = {
  couple: "Rola & Marco",
  date: "2026-11-07",                 // YYYY-MM-DD
  dateLabel: "Saturday, 7 November 2026",
  venue: "",                          // TODO e.g. "Villa Name, Cairo" — leave "" to hide

  // Who guests should ask if their name isn't found
  helpContact: "the welcome desk",    // TODO e.g. "Michael at the welcome desk"

  // What a table is called on the result card: "Table" → "Table 7"
  tableWord: "Table",

  // Optional: give tables names instead of / in addition to numbers.
  // Keys are what appears in the "table" column of guests.csv.
  // Example: { "1": "Jasmine", "2": "Olive" } → "Table 1 · Jasmine"
  tableNames: {},

  welcome: {
    show: true,
    title: "Welcome",
    // TODO: replace with the couple's own words. Use \n\n for a new paragraph.
    text:
      "We are so happy you are here to celebrate with us.\n\n" +
      "Find your seat, grab a drink, and get ready for a night to remember.",
    signature: "— Rola & Marco",
    hashtag: "",                      // TODO e.g. "#RolaAndMarco" — "" to hide
    wifi: { network: "", password: "" } // TODO — leave network "" to hide
  },

  schedule: {
    show: true,
    title: "The Evening",
    // Times can be "3:00 pm" or "15:00". Times after midnight are handled.
    // icon: glasses | couple | cake | cloche | car  (or leave it out)
    items: [
      { time: "3:00 pm",  title: "Cocktails & Snacks", note: "", icon: "glasses" },
      { time: "4:00 pm",  title: "Entrance & First Dance", note: "", icon: "couple" },
      { time: "7:30 pm",  title: "Cake Cutting & Toasts", note: "", icon: "cake" },
      { time: "8:00 pm",  title: "Buffet", note: "", icon: "cloche" },
      { time: "12:00 am", title: "Carriages", note: "", icon: "car" }
    ]
  },

  // Reserved for a later floor plan with the guest's table highlighted.
  // Leave as null for now.
  floorPlan: null
};
