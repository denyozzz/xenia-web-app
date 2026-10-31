export type SwitchRow = { label: string; key: string };

export const SWITCH_GROUPS: { title: string; parts: SwitchRow[][] }[] = [
  {
    title: "Linker Schalter",
    parts: [[
      { label: "Links kurz drücken", key: "SWITCH_SET_LEFT_LEFT_0" },
      { label: "Links lang drücken", key: "SWITCH_SET_LEFT_LEFT_1" },
    ]],
  },
  {
    title: "Rechter Schalter",
    parts: [
      [
        { label: "Links kurz drücken", key: "SWITCH_SET_RIGHT_LEFT_0" },
        { label: "Links lang drücken", key: "SWITCH_SET_RIGHT_LEFT_1" },
      ],
      [
        { label: "Rechts kurz drücken", key: "SWITCH_SET_RIGHT_RIGHT_0" },
        { label: "Rechts lang drücken", key: "SWITCH_SET_RIGHT_RIGHT_1" },
      ],
    ],
  },
];

export const RECIPE_LINKS = [
  { label: "Kaffeezentrale", url: "https://www.kaffeezentrale.de/kaffeerezepte" },
  { label: "Rauwolf", url: "https://rauwolf-coffee.at/kaffeespezialitaeten/italienische-kaffeespezialitaeten/" },
  { label: "Espresso International", url: "https://www.espresso-international.de/blogs/kaffeewissen/italienische-kaffeespezialitaeten" },
];
