// Emoji for the icon picker: "emoji keywords…" per entry, grouped like Notion's picker.

const RAW: Record<string, string[]> = {
  People: [
    '😀 smile happy grin', '😃 smile happy', '😄 laugh happy', '😁 grin', '😆 laugh', '😅 sweat smile', '😂 joy laugh tears', '🙂 slight smile', '😉 wink', '😊 blush smile',
    '😍 love heart eyes', '🥰 love hearts', '😘 kiss', '😎 cool sunglasses', '🤩 star struck', '🤔 thinking', '😐 neutral', '😴 sleep', '😭 cry sad', '😡 angry',
    '🤯 mind blown', '🥳 party', '🤓 nerd', '😇 angel', '🙃 upside down', '😬 grimace', '🤗 hug', '🫡 salute', '👋 wave hello', '👍 thumbs up yes',
    '👎 thumbs down no', '👏 clap', '🙌 raised hands', '🙏 pray thanks', '💪 strong muscle', '🤝 handshake deal', '✌️ peace', '👀 eyes look', '🧠 brain', '👤 person user',
    '👥 people team', '👶 baby', '🧑‍💻 developer coder', '🧑‍🎓 student', '🧑‍🏫 teacher', '🧑‍⚕️ doctor', '🧑‍🍳 cook chef', '🧑‍🎨 artist',
  ],
  Nature: [
    '🌱 seedling plant grow', '🌿 herb leaf', '🌳 tree', '🌲 evergreen', '🌴 palm', '🌵 cactus', '🍀 clover luck', '🌸 blossom flower', '🌹 rose', '🌻 sunflower',
    '🌷 tulip', '🍁 maple leaf autumn', '🍄 mushroom', '🌍 earth world globe', '🌙 moon night', '☀️ sun day', '⭐ star', '🌟 glowing star', '✨ sparkles magic', '⚡ lightning bolt',
    '🔥 fire hot', '💧 water drop', '🌊 wave ocean sea', '❄️ snow cold', '☁️ cloud', '🌈 rainbow', '☔ rain umbrella', '🐶 dog', '🐱 cat', '🐭 mouse',
    '🐻 bear', '🦊 fox', '🐼 panda', '🦁 lion', '🐸 frog', '🐵 monkey', '🐔 chicken', '🐧 penguin', '🦉 owl', '🦋 butterfly',
    '🐝 bee', '🐢 turtle', '🐙 octopus', '🐬 dolphin', '🦄 unicorn', '🐉 dragon',
  ],
  Food: [
    '🍎 apple fruit', '🍊 orange', '🍋 lemon', '🍌 banana', '🍉 watermelon', '🍇 grapes', '🍓 strawberry', '🍒 cherry', '🥑 avocado', '🥕 carrot',
    '🌽 corn', '🍅 tomato', '🥦 broccoli', '🍞 bread', '🧀 cheese', '🥚 egg', '🥓 bacon', '🍔 burger', '🍟 fries', '🍕 pizza',
    '🌮 taco', '🍣 sushi', '🍜 noodles ramen', '🍝 pasta spaghetti', '🍰 cake', '🍩 donut', '🍪 cookie', '🍫 chocolate', '🍿 popcorn', '☕ coffee tea',
    '🍵 tea matcha', '🍺 beer', '🍷 wine', '🥤 drink', '🧃 juice',
  ],
  Activities: [
    '⚽ soccer football', '🏀 basketball', '🏈 american football', '⚾ baseball', '🎾 tennis', '🏐 volleyball', '🏓 ping pong', '🥊 boxing', '🏆 trophy win', '🥇 gold medal first',
    '🎯 target goal dart', '🎮 game controller', '🎲 dice', '🧩 puzzle', '🎨 art palette paint', '🎬 movie film', '🎤 microphone sing', '🎧 headphones music', '🎹 piano', '🎸 guitar',
    '🎻 violin', '🥁 drum', '🏃 run', '🚴 bike cycling', '🏊 swim', '🧘 yoga meditate', '🏋️ weights gym', '🎳 bowling', '♟️ chess',
  ],
  Travel: [
    '🚗 car', '🚕 taxi', '🚌 bus', '🚆 train', '✈️ plane flight travel', '🚀 rocket launch', '🚢 ship', '⛵ sailboat', '🚲 bicycle', '🏠 house home',
    '🏢 office building', '🏫 school', '🏥 hospital', '🏦 bank', '🏰 castle', '⛺ camp tent', '🗽 statue liberty', '🗼 tower', '🗺️ map', '🧭 compass',
    '🏝️ island beach', '🏔️ mountain', '🌋 volcano', '🌆 city', '🌃 night city', '🛒 cart shopping',
  ],
  Objects: [
    '📄 page document', '📝 memo note write', '📚 books library', '📖 open book read', '📕 red book', '📗 green book', '📘 blue book', '📙 orange book', '📓 notebook', '📔 notebook',
    '📒 ledger', '🗂️ folder index', '📁 folder', '📂 open folder', '📅 calendar date', '📆 calendar', '🗓️ calendar spiral', '📌 pin', '📍 location pin', '📎 paperclip',
    '✂️ scissors', '🔗 link', '🔒 lock', '🔓 unlock', '🔑 key', '🔨 hammer', '🛠️ tools', '⚙️ gear settings', '🧰 toolbox', '🔧 wrench',
    '💡 idea bulb light', '🔦 flashlight', '🔋 battery', '💻 laptop computer', '🖥️ desktop', '⌨️ keyboard', '🖱️ mouse', '📱 phone mobile', '☎️ telephone', '📷 camera photo',
    '🎥 video camera', '📺 tv', '📻 radio', '⏰ alarm clock', '⏳ hourglass', '⌚ watch', '💰 money bag', '💵 dollar cash', '💳 credit card', '💎 gem diamond',
    '📈 chart up growth', '📉 chart down', '📊 bar chart stats', '📬 mailbox', '📧 email', '✉️ envelope mail', '📦 package box', '🏷️ label tag', '🔍 search magnifier', '🔬 microscope science',
    '🔭 telescope', '🧪 test tube lab', '💊 pill medicine', '🩺 stethoscope', '🧬 dna', '🛡️ shield', '⚖️ scale law', '🎁 gift present', '🎈 balloon', '🎉 party popper celebrate',
    '🎊 confetti', '🏁 finish flag', '🚩 red flag', '🧹 broom clean', '🧺 basket laundry', '🪴 plant pot', '🛏️ bed', '🛋️ couch', '🚿 shower', '🧸 teddy bear',
  ],
  Symbols: [
    '❤️ red heart love', '🧡 orange heart', '💛 yellow heart', '💚 green heart', '💙 blue heart', '💜 purple heart', '🖤 black heart', '🤍 white heart', '💔 broken heart', '💯 hundred perfect',
    '✅ check done yes', '☑️ checkbox', '❌ cross no x', '❗ exclamation important', '❓ question', '⚠️ warning caution', '🚫 prohibited', 'ℹ️ info', '♻️ recycle', '➕ plus add',
    '➖ minus', '➡️ right arrow', '⬅️ left arrow', '⬆️ up arrow', '⬇️ down arrow', '🔄 refresh sync', '🔔 bell notification', '🔕 bell off mute', '🆕 new', '🆗 ok',
    '🔴 red circle', '🟠 orange circle', '🟡 yellow circle', '🟢 green circle', '🔵 blue circle', '🟣 purple circle', '⚫ black circle', '⚪ white circle', '🔶 diamond', '🔷 blue diamond',
    '🏳️ white flag', '🏴 black flag', '🇺🇳 united nations', '⭕ circle', '©️ copyright', '™️ trademark',
  ],
}

export interface EmojiEntry {
  char: string
  words: string
  group: string
}

export const EMOJI_GROUPS: { name: string; items: EmojiEntry[] }[] = Object.entries(RAW).map(([name, list]) => ({
  name,
  items: list.map((line) => {
    const i = line.indexOf(' ')
    return { char: line.slice(0, i), words: line.slice(i + 1), group: name }
  }),
}))

export function searchEmoji(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  return EMOJI_GROUPS.flatMap((g) => g.items).filter((e) => e.words.includes(q))
}

export const randomEmoji = () => {
  const all = EMOJI_GROUPS.flatMap((g) => g.items)
  return all[Math.floor(Math.random() * all.length)].char
}
