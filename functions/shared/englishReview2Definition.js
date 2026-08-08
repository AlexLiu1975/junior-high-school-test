const REVIEW_ID = "english-review-2";

function question(number, section, text, options, correctIndex, explanation, extra = {}) {
  const id = `e${String(number).padStart(2, "0")}`;
  return {
    id,
    number,
    section,
    points: section === 1 ? 2 : 3,
    text,
    explanation,
    ...extra,
    options: options.map((optionText, index) => ({
      id: `${id}-o${index + 1}`,
      text: optionText,
      correct: index === correctIndex,
    })),
  };
}

const readings = {
  r1: "【21～25】\nJohn: Look! There are so many people ___21.___ that red building. What is that place? Is it a museum ___22.___ a restaurant?\nLinda: Neither. It's a new movie theater.\nJohn: It's special. It looks like a big robot.\nLinda: Yes, it's really cool.\nJohn: But I seldom watch movies at theaters.\nLinda: ___23.___, I never go to the movies. Movie tickets are too expensive for me. I like watching movies at home. My sofa is soft, and my blanket is warm.\nJohn: I know. I enjoy watching movies at home, too. By the way, I'm a little hungry.\nLinda: There's a new restaurant near the fruit market. ___24.___\nJohn: Great! But ___25.___ the fruit market? Is it far?\nLinda: No, it's not. We can walk there in five minutes.\nJohn: Let's go then!",
  r2: "【26～30】\nHello, boys and girls. Welcome to Happy Zoo. My name is Jonathan Lee, and I'm your tour guide today. There are a lot of cute and special animals here. Please ___26.___ make noise or give them food. ___27.___ in line and follow me. Now, let's ___28.___ the animals!\nThere are two little tigers. They are Lala and Oreo. They are playing with a soccer ball. They are like big cats. Look over there! There are a lot of monkeys. It is warm and nice today, and every monkey is jumping and running ___29.___.\nThey are really energetic. We also have sheep, lions, and many other animals in Happy Zoo. What is your favorite animal? You ___30.___ share your idea with me!",
  r3: "【31～33】\nHi Kevin,\nI went to your restaurant with Mandy and Jeremy today. You are a great cook. You always want to have your own restaurant, and we are happy for you.\nThe place is warm and nice. The tables in different colors are really cool. The food is also delicious. But there are some problems. There are only three tables and twelve chairs. Many people need to wait in line outside. There is still much space in the restaurant. Why not have more tables and chairs? Also, there are only five things on the menu. You are good at making cakes. We love your fruit cakes. How about putting fruit cakes on the menu, too?\nYou must be very busy these days. Take good care!\nLove,\nHanna",
  r4: "【34～36】\nHello, everyone. I'm Mark. This is my small library at home. There are four areas. Books in the first area are about animals. The storybook about a smart zebra is my favorite. The area next to it is the English area. There are many English storybooks. Sometimes the books are too difficult for me, and I need my parents to read them with me. On the other side, I have a fun area and a food area. Books in the fun area are about different cool things in the world. There aren't any books in the food area. I prepare some food there. I enjoy reading and eating at the same time. My library is cool, right?",
  r5: "【37～40】\nMr. Lee asked his students to change seats today, and here is the new seating plan.\n\n[Blackboard]\nRow 1: Alex | Jane   | Ian  | Ben\nRow 2: Tina | Andrew | Leo  | Jay\nRow 3: Mia  | Emma   | Anne | Dan\nRow 4: Lily | Zoe    | Sam  | Rita",
};

const questions = [
  question(1, 1, "1. Hank's ideas are terrible. I don't want to ___ to him.", ["(A) cross", "(B) sit", "(C) listen", "(D) get"], 2, "解析：listen to... 為固定搭配用語，意為「聽某人說話/傾聽」。"),
  question(2, 1, "2. Girls, please stand on this side of the classroom, and boys on the ___ side.", ["(A) early", "(B) other", "(C) real", "(D) noisy"], 1, "解析：the other side 意為「另一邊」。"),
  question(3, 1, "3. Peter: ___ is Dad?\nTim: He's not home. He's out for dinner.", ["(A) When", "(B) Where", "(C) How", "(D) What"], 1, "解析：回答爸爸不在家，可知題目詢問位置「在哪裡 (Where)」。"),
  question(4, 1, "4. Kevin is different from his brothers. They make a lot of ___, but Kevin is quiet.", ["(A) noise", "(B) news", "(C) ideas", "(D) sheep"], 0, "解析：後文說 Kevin 很安靜，可推知其他人製造很多「噪音 (noise)」。make noise 意為製造噪音。"),
  question(5, 1, "5. ___ open the blue box. It's a gift for Rachel.", ["(A) Not to", "(B) Not", "(C) Don't", "(D) No"], 2, "解析：否定祈使句句首使用 Don't + 原形動詞。"),
  question(6, 1, "6. Lisa can't ___ between white and orange. She likes both colors.", ["(A) talk", "(B) design", "(C) wait", "(D) choose"], 3, "解析：choose between... 代表「在...之間做出選擇」。"),
  question(7, 1, "7. The junior high school is ___ the park ___ the school.", ["(A) next; to", "(B) between; and", "(C) inside; of", "(D) in front; of"], 1, "解析：between A and B 表示「在 A 與 B 之間」。"),
  question(8, 1, "8. My brother is ___ my teacher. He teaches me math and English.", ["(A) very", "(B) only", "(C) too", "(D) also"], 3, "解析：also 意為「也是/也是我的老師」。"),
  question(9, 1, "9. Everyone is studying in the library. Please ___ quiet.", ["(A) are", "(B) is", "(C) to be", "(D) be"], 3, "解析：祈使句 Please 後接原形動詞，quiet 為形容詞，故需使用 be 動詞 (be quiet)。"),
  question(10, 1, "10. Vicky: This book is terrible.\nLeo: Really? ___ read it then.", ["(A) Let's no", "(B) Not to", "(C) Let's not", "(D) Please not"], 2, "解析：Let's 的否定句型為 Let's not + 原形動詞。"),
  question(11, 1, "11. Alan: Ms. Lee, can I ask you a ___ about the math homework?\nMs. Lee: Sure. What is it?", ["(A) question", "(B) song", "(C) photo", "(D) step"], 0, "解析：ask a question 代表「提問/問一個問題」。"),
  question(12, 1, "12. James: Who's the tall girl ___ you in the photo?\nHank: She's my cousin, Anna.", ["(A) next", "(B) in front", "(C) behind", "(D) inside"], 2, "解析：behind you (在你背後)。選項(A)須加 to，(B)須加 of 才完整。"),
  question(13, 1, "13. Judy is our new classmate. She is over there. Let's go and ___ to her.", ["(A) upload", "(B) watch", "(C) check", "(D) talk"], 3, "解析：talk to her 代表「與她交談」。"),
  question(14, 1, "14. Leo: Am I late for the meeting?\nAnn: No, you're ___. It's only 8:45. The meeting is at 9 o'clock.", ["(A) special", "(B) early", "(C) real", "(D) expensive"], 1, "解析：會議 9 點開，現在才 8:45，故代表「很早 (early)」。"),
  question(15, 1, "15. Karen: ___ practice basketball with me, ___.\nAlex: But I have no time today.", ["(A) Alex; please", "(B) To; please", "(C) Please; Alex", "(D) Let's; too"], 0, "解析：祈使句呼喚人名加 please 的句型：人名, please + 動詞 或 稱呼語置前/置後。"),
  question(16, 1, "16. Let's ___ these nice photos to the Internet and share them with your uncle in the USA.", ["(A) upload", "(B) download", "(C) design", "(D) warn"], 0, "解析：upload... to the Internet 代表「上傳...到網路」。"),
  question(17, 1, "17. My sons are playing soccer with ___ friends on the sports field, and I want to take a photo of ___.", ["(A) they; they", "(B) their; them", "(C) they; them", "(D) their; their"], 1, "解析：第一空填所有格 their (他們的朋友)；第二空介系詞 of 後需接人稱代名詞受格 them。"),
  question(18, 1, "18. Rita: Let's ___ the restaurant next to the park!\nIan: Sure. I love the food there.", ["(A) are visiting", "(B) to visit", "(C) visiting", "(D) visit"], 3, "解析：Let's 後接原形動詞。"),
  question(19, 1, "19. Pete: Look, this is my new ___. It's cool, right?\nLisa: Yes, it is. Can you give me your phone number?", ["(A) smartphone", "(B) road", "(C) way", "(D) sidewalk"], 0, "解析：後文提到索取電話號碼，故可推知前面是指「智慧型手機 (smartphone)」。"),
  question(20, 1, "20. Lisa can't ___ to the party. She is not happy.", ["(A) goes", "(B) to go", "(C) go", "(D) going"], 2, "解析：助動詞 can / can't 後接原形動詞。"),
  question(21, 2, "21. (A) between (B) next (C) in front of (D) with", ["(A) between", "(B) next", "(C) in front of", "(D) with"], 2, "解析：in front of that red building 代表「在那棟紅色建築物前面」。", { readingId: "r1" }),
  question(22, 2, "22. (A) and (B) or (C) but (D) of", ["(A) and", "(B) or", "(C) but", "(D) of"], 1, "解析：二選一選擇疑問句，使用 or (還是)。", { readingId: "r1" }),
  question(23, 2, "23. (A) No wonder (B) Of course (C) What about (D) In fact", ["(A) No wonder", "(B) Of course", "(C) What about", "(D) In fact"], 3, "解析：In fact 意為「事實上/實際上」。", { readingId: "r1" }),
  question(24, 2, "24. (A) Let's go and check it out. (B) Don't listen to me. (C) I want to go home now. (D) Let's get some fruit.", ["(A) Let's go and check it out.", "(B) Don't listen to me.", "(C) I want to go home now.", "(D) Let's get some fruit."], 0, "解析：介紹完新餐廳後提議「我們去看看吧 (Let's go and check it out)」。", { readingId: "r1" }),
  question(25, 2, "25. (A) can it (B) what is (C) where is (D) is it", ["(A) can it", "(B) what is", "(C) where is", "(D) is it"], 2, "解析：問句詢問水果市場「在哪裡 (Where is)」。", { readingId: "r1" }),
  question(26, 2, "26. (A) not to (B) not (C) don't (D) aren't", ["(A) not to", "(B) not", "(C) don't", "(D) aren't"], 2, "解析： Please + 否定祈使句 (don't + 原形動詞)。", { readingId: "r2" }),
  question(27, 2, "27. (A) To stand (B) Stand (C) Stands (D) Be standing", ["(A) To stand", "(B) Stand", "(C) Stands", "(D) Be standing"], 1, "解析：句首祈使句使用原形動詞 Stand (站好/排隊)。", { readingId: "r2" }),
  question(28, 2, "28. (A) meet (B) meeting (C) is meeting (D) to meet", ["(A) meet", "(B) meeting", "(C) is meeting", "(D) to meet"], 0, "解析：let's 後接原形動詞 (meet)。", { readingId: "r2" }),
  question(29, 2, "29. (A) near (B) beside (C) inside (D) around", ["(A) near", "(B) beside", "(C) inside", "(D) around"], 3, "解析：run around 代表「到處亂跑/四處奔跑」。", { readingId: "r2" }),
  question(30, 2, "30. (A) do (B) are (C) can (D) be", ["(A) do", "(B) are", "(C) can", "(D) be"], 2, "解析：You can share... 表示「你可以分享你的想法」。", { readingId: "r2" }),
  question(31, 2, "31. Who went to the restaurant with Hanna?", ["(A) Kevin and Jeremy.", "(B) Mandy and Jeremy.", "(C) Kevin and Mandy.", "(D) Only Jeremy."], 1, "解析：內文「I went to your restaurant with Mandy and Jeremy today.」可知是 Mandy 與 Jeremy。", { readingId: "r3" }),
  question(32, 2, "32. Which is NOT one of the 'problems'?", ["(A) There aren't enough tables.", "(B) Kevin's food is not yummy.", "(C) There are only 5 things on the menu.", "(D) There are only 12 chairs."], 1, "解析：內文明確說「The food is also delicious.」，食物很美味，故 (B) 非問題。", { readingId: "r3" }),
  question(33, 2, "33. Which is NOT true about the restaurant?", ["(A) It is Kevin's restaurant.", "(B) The food there is delicious.", "(C) Many people visit it.", "(D) It is not big enough for more tables."], 3, "解析：內文說「There is still much space in the restaurant.」(空間還很大)，故 (D) 敘述不正確。", { readingId: "r3" }),
  question(34, 2, "34. What do we know about Mark's favorite book?", ["(A) It's in the fun area.", "(B) It's about a zebra.", "(C) It's a Chinese book.", "(D) It's difficult for him."], 1, "解析：內文提到「The storybook about a smart zebra is my favorite.」。", { readingId: "r4" }),
  question(35, 2, "35. There aren't any books in one area. Which is it?", ["(A) The fun area.", "(B) The animal area.", "(C) The food area.", "(D) The English area."], 2, "解析：內文提到「There aren't any books in the food area.」。", { readingId: "r4" }),
  question(36, 2, "36. Which is Mark's small library?", ["(A)", "(B)", "(C)", "(D)"], 0, "解析：對照文章描述：1. 第一區是 Animal 區；2. Animal 區隔壁是 English 區 (同側上下相鄰)；3. 另一側為 Fun 區與 Food 區。因此 (A) 完全符合配置！", { readingId: "r4", figureId: "library-layout-q36" }),
  question(37, 2, "37. Where is Andrew's new seat?", ["(A) It's in front of Jane's seat.", "(B) It's next to Jay's seat.", "(C) It's in front of Emma's seat.", "(D) It's behind Dan's seat."], 2, "解析：對照座位表，Andrew 在 Emma 的正前方 (in front of Emma's seat)。", { readingId: "r5" }),
  question(38, 2, "38. ___ seat is between Emma's and Dan's seats.", ["(A) Sam's", "(B) Ian's", "(C) Lily's", "(D) Anne's"], 3, "解析：第三排座位順序為 Mia, Emma, Anne, Dan，Anne 在 Emma 與 Dan 中間。", { readingId: "r5" }),
  question(39, 2, "39. Message: 'May I change seats with you? Zoe is my good friend, and I want to sit next to her. Thank you! — Tina'\nWho is the message for?", ["(A) Anne.", "(B) Lily.", "(C) Rita.", "(D) Alex."], 1, "解析：Zoe 在第四排第二列，其兩旁為 Lily 與 Sam。Tina 想坐在 Zoe 旁邊，此便條應是寫給 Lily。", { readingId: "r5" }),
  question(40, 2, "40. Which is true about the seating plan?", ["(A) Sam's seat is behind Anne's seat.", "(B) Alex's seat is next to Jay's seat.", "(C) Jay's seat is in front of Ian's seat.", "(D) Emma's seat is behind Dan's seat."], 0, "解析：Sam 在第四排第三列，位於 Anne (第三排第三列) 的正後方 (behind)。", { readingId: "r5" }),
];

export const ENGLISH_REVIEW_2 = {
  id: REVIEW_ID,
  version: 1,
  kind: "review",
  subject: "English",
  title: "英語科 第2回複習考",
  catalogDescription: "第一冊 L3～L4（表位置的介系詞／Where問答／祈使句／人稱代名詞受格／can問答）",
  readings,
  questions,
};
