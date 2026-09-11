export type P1QuestionSet = {
  id: string;
  topic: string;
  questions: string[];
  /** No longer in the current season's bank; kept so past work still resolves. */
  retired?: boolean;
};

export type P2P3QuestionSet = {
  id: string;
  topic: string;
  p2Prompt: string;
  p3Questions: string[];
  /** Earlier wordings of the cue-card title, so older assignments still match this topic. */
  aliases?: string[];
  retired?: boolean;
};

/**
 * The bank is the current season's list (2026 年 9–12 月), in the order the
 * source gives it, followed by the retired topics from the season before.
 *
 * Retired topics stay in the file rather than being deleted: a student's
 * practised-topic status is worked out by matching the question text in their
 * submissions against the bank, and their self-practice rows carry topic ids.
 * Removing a topic would silently un-tick everything they did on it. Carried-
 * over topics keep their id and every question they ever had, for the same
 * reason. The pickers and the totals use currentP1Bank / currentP2P3Bank.
 */

function cueCard(title: string, bullets: string[]) {
  return `${title}.\n\nYou should say:\n${bullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

export const p1QuestionBank: P1QuestionSet[] = [
  {
    id: "work-studies",
    topic: "Work/Studies",
    questions: [
      "Do you work or study? / What’s your job/major?",
      "Why did you choose this major/ job?",
      "Is this a popular job/major in your country?",
      "What’s your favourite part of your job/major?",
      "Do you plan to change your job in the future?"
    ]
  },
  {
    id: "hometown",
    topic: "Hometown",
    questions: [
      "Where’s your hometown?",
      "Do you like your hometown?",
      "Is your hometown suitable for young people?",
      "Has your hometown changed in recent years?",
      "What is one of the best things about living there?",
      "Do you think you'll continue living there for a long time?"
    ]
  },
  {
    id: "accommodation",
    topic: "Accommodation",
    questions: [
      "What kind of accommodation do you live in?",
      "Do you like your accommodation? How long have you lived there?",
      "What would you change about your accommodation?",
      "Do you plan to live there for a long time?"
    ]
  },
  {
    id: "the-area-you-live-in",
    topic: "The area you live in",
    questions: [
      "Do you like the area you live in?",
      "What’s around your area?",
      "Are there any recent changes in the area that you live in?",
      "Do you know any of your neighbours?",
      "Would you like to change anything about your area? Why/Why not?"
    ]
  },
  {
    id: "glasses",
    topic: "Glasses",
    questions: [
      "Do you wear glasses?",
      "Do you like wearing glasses?",
      "Would you consider wearing contact lenses?",
      "Do you know many people who wear glasses?",
      "Is it expensive to buy glasses in your country?",
      "Do you think people look more attractive with or without glasses?",
      "What would you do if you lost or broke your glasses?"
    ]
  },
  {
    id: "street-market",
    topic: "Street market",
    questions: [
      "Are there many street markets in China?",
      "When was the last time you went to a street market?",
      "Do you prefer to go shopping in the shopping mall or on the street market?",
      "What do people usually buy on the street market?"
    ]
  },
  {
    id: "name",
    topic: "Name",
    questions: [
      "Is it easy for you to remember people's names?",
      "How do you remember people's names?",
      "How do you feel when people can't remember your name?",
      "Do you often forget people's names?"
    ]
  },
  {
    id: "paper-letters",
    topic: "Paper Letters",
    questions: [
      "Do you ever write paper letters?",
      "Did you receive any handwritten letters when you were a child?",
      "Do you prefer handwritten letters or instant messaging or texting?",
      "Do you prefer writing letters or sending emails?"
    ]
  },
  {
    id: "rubbish-and-recycling",
    topic: "Rubbish and recycling",
    questions: [
      "Is waste sorting common in your country?",
      "Did you recycle when you were a kid?",
      "What do you do when you see rubbish on the street?",
      "How do you recycle things like paper and plastic?"
    ]
  },
  {
    id: "paper",
    topic: "Paper",
    questions: [
      "Have you made any crafts with paper?",
      "Do you still write physical letters?",
      "Do people still keep handwritten letters today?",
      "Do you carry paper and pens with you when you go out?",
      "What did you like to do with paper as a child?"
    ]
  },
  {
    id: "advertisement",
    topic: "Advertisement",
    questions: [
      "Do you like advertisements?",
      "What kind of advertising do you like?",
      "Do you often see advertisements when you are on your phone or computer?",
      "Is there an advertisement that made an impression on you when you were a child?",
      "Have you ever bought something because of an advertisement?"
    ]
  },
  {
    id: "tiredness",
    topic: "Tiredness",
    questions: [
      "Do you often feel tired?",
      "When would you feel tired?",
      "What do you do when you feel tired?",
      "When you feel tired, do you still go out with your friends?"
    ]
  },
  {
    id: "politeness",
    topic: "Politeness",
    questions: [
      "How did you learn to be polite as a child?",
      "Do you think being polite is very important?",
      "On what occasions should we be polite?",
      "What did you do to show your politeness as a child?"
    ]
  },
  {
    id: "secondary-school",
    topic: "Secondary school",
    questions: [
      "Do you remember your first day at secondary school?",
      "Were there any subjects that you found difficult at secondary school?",
      "What was your favourite subject at secondary school?",
      "Is there anything you miss about your secondary school?"
    ]
  },
  {
    id: "shoes",
    topic: "Shoes",
    questions: [
      "Do you like buying shoes? How often?",
      "Have you ever bought shoes online?",
      "How much money do you usually spend on shoes?",
      "Which do you prefer, fashionable shoes or comfortable shoes?"
    ]
  },
  {
    id: "fruit-and-vegetables",
    topic: "Fruit and vegetables",
    questions: [
      "Do you like eating vegetables?",
      "How often do you eat fruit and vegetables?",
      "Did you like eating vegetables when you were a child?",
      "Were there any kind of fruits and vegetables you disliked as a child?",
      "Do people often grow vegetables by themselves?",
      "Where do you usually buy fruit and vegetables?"
    ]
  },
  {
    id: "travelling",
    topic: "Travelling",
    questions: [
      "Do you prefer sitting by the window when you travel?",
      "Did you ever go on a long journey with your family when you were a child?"
    ]
  },
  {
    id: "singing",
    topic: "Singing",
    questions: [
      "Do you like singing?",
      "Do you like listening to other people sing?",
      "Did you learn to sing when you were at school?",
      "Do you enjoy singing in the car?",
      "Did you like singing when you were a kid?",
      "Do you like singing? Why?",
      "Have you ever learnt how to sing?",
      "Who do you want to sing for?",
      "Do you think singing can bring happiness to people?",
      "Do you like listening to others singing?",
      "Have you ever taken a singing class?"
    ]
  },
  {
    id: "watch",
    topic: "Watch",
    questions: [
      "Do you wear a watch in your daily life?",
      "Has anyone ever given you a watch as a gift?",
      "What kind of watch do the people around you like to wear?",
      "Why do some people wear expensive watch?",
      "Do you think it is important to wear a watch? Why?",
      "Do you wear a watch?",
      "Have you ever got a watch as a gift?",
      "Why do some people wear expensive watches?"
    ]
  },
  {
    id: "feeling-bored",
    topic: "Feeling Bored",
    questions: [
      "Do you often feel bored?",
      "Did you ever find school boring when you were a child?",
      "What sort of things do you find most boring now?",
      "What do you do to stop yourself feeling bored?",
      "When would you feel bored?",
      "What do you do when you feel bored?",
      "Do you think childhood is boring or adulthood is boring?"
    ]
  },
  {
    id: "public-gardens-parks",
    topic: "Parks",
    questions: [
      "Did you like going to parks as a child?",
      "Do you still like going to parks now?",
      "Would you like to see more parks in your city?",
      "Are there any parks you want to go to in the future?",
      "Would you prefer to play in a personal garden or public garden?",
      "How are the parks today different from those you visited as a kid?",
      "What do you like to do when visiting a park?",
      "Would you like to play in a public garden or park?"
    ]
  },
  {
    id: "tidiness",
    topic: "Tidiness",
    questions: [
      "Do you like to keep things tidy?",
      "Did you use to keep your room tidy as a child?",
      "Are you a tidy person now?",
      "How do you keep your work or study space tidy?",
      "Do you think that it is necessary to be tidy?",
      "What do you think of those who don't care about tidiness?",
      "What do you think of those who are overly concerned about tidiness?"
    ]
  },
  {
    id: "headphones",
    topic: "Headphones",
    questions: [
      "Do you use headphones?",
      "How often do you wear headphones?",
      "Do you think headphones are useful?",
      "Are headphones popular in your country?",
      "In what situations should people not wear headphones?",
      "What type of headphones do you use?",
      "When would you use headphones?",
      "In what conditions would you not use headphones?",
      "Is wearing headphones comfortable?"
    ]
  },
  {
    id: "outer-space-stars",
    topic: "Space",
    questions: [
      "Have you ever learnt anything about space and the stars when you were at school?",
      "Would you like to know more about space and the stars?",
      "Do you like science-fiction movies set in space?",
      "Do you want to go into outer space in the future?",
      "Have you ever learnt about outer space and stars?",
      "Do you like science fiction movies? Why?",
      "Do you want to know more about outer space?"
    ]
  },
  {
    id: "clothing",
    topic: "Clothing",
    questions: [
      "What kind of clothes do you like to wear?",
      "Do you prefer to wear comfortable and casual clothes or formal clothes?",
      "Do you like wearing T-shirts?",
      "Do you spend a lot of time choosing clothes?",
      "Do you wear clothes of different styles on weekdays and weekends?",
      "What colour clothing do you like?",
      "Do you prefer casual clothes or smart clothes?",
      "What colour clothes do you like?",
      "Do you prefer to wear comfortable and casual clothes or smart clothes?",
      "Do you wear different styles of clothes on weekdays and weekends?"
    ]
  },
  {
    id: "jokes-comedies",
    topic: "Telling jokes",
    questions: [
      "Are you good at telling jokes?",
      "Do your friends like to tell jokes?",
      "Do you like to watch comedies?",
      "Have you ever watched a live show?",
      "Are comedy shows popular in your country?"
    ]
  },
  {
    id: "mirrors",
    topic: "Mirrors",
    questions: [
      "Do you like looking at yourself in the mirror? How often?",
      "Have you ever bought mirrors?",
      "Do you usually take a mirror with you?",
      "Would you use mirrors to decorate your room?",
      "Do you like looking at yourself in the mirror?"
    ]
  },
  {
    id: "science",
    topic: "Science",
    questions: [
      "Do you like science?",
      "When did you start to learn about science?",
      "Which science subject is interesting to you?",
      "What kinds of interesting things have you done with science?",
      "Do you like watching science TV programs?",
      "Do Chinese people often visit science museums?"
    ]
  },
  {
    id: "cars",
    topic: "Cars",
    questions: [
      "Did you enjoy traveling by car when you were a kid?",
      "What types of cars do you like?",
      "Do you prefer to be a driver or a passenger?",
      "What do you usually do when there is a traffic Jam?",
      "Do you think car colours are important?",
      "Will you buy an expensive car in the future?"
    ]
  },
  {
    id: "shopping",
    topic: "Shopping",
    questions: [
      "Do you like shopping?",
      "How often do you go shopping?",
      "Do you prefer online shopping or in-store shopping?",
      "Do you compare prices when you shop? Why?",
      "Is it difficult for you to make choices when you shop?",
      "Do you think expensive products are always better than cheaper ones?",
      "Have you ever returned anything you bought online?"
    ]
  },
  {
    id: "websites",
    topic: "Websites",
    questions: [
      "What kinds of websites do you often visit?",
      "What is your favourite website?",
      "Are there any changes to the websites you often visit?",
      "What kinds of websites are popular in your country?",
      "Do you prefer getting information from websites or books?",
      "Would you like to have your own website?",
      "How can websites help your life or studies?",
      "What have you learned from websites that help with your life or studies?"
    ]
  },
  {
    id: "music",
    topic: "Music",
    questions: [
      "Do you like music?",
      "What kinds of music do you listen to?",
      "Do you prefer sad or happy music?",
      "Does happy music make you feel more excited?",
      "Have you taken any music classes?",
      "Do you listen to music while doing other things?"
    ]
  },
  {
    id: "social-media",
    topic: "Social Media",
    questions: [
      "Have you ever posted anything on social media?",
      "When did you start using social media?",
      "Do you think you spend too much time on social media?",
      "Do your friends use social media?",
      "What do people often do on social media?"
    ]
  },
  {
    id: "teachers",
    topic: "Teachers",
    questions: [
      "Do you have a favorite teacher?",
      "Do you want to be a teacher in the future?",
      "Do you have a teacher from your past that you still remember?",
      "Are you still in touch with your primary school teachers?",
      "In what way has your favourite teacher helped you?",
      "Do you like your primary school teachers more than your high school teachers?",
      "What kind of teacher do you remember best?",
      "Do you still keep in touch with your high school teachers?"
    ]
  },
  {
    id: "the-city-you-live-in",
    topic: "The city you live in",
    questions: [
      "What city do you live in?",
      "Do you like this city? Why?",
      "How long have you lived in this city?",
      "Are there big changes in this city?",
      "Is this city your permanent residence?",
      "Are there people of different ages living in this city?"
    ]
  },
  // ---- Retired (2026 年 5–8 月) ----
  {
    id: "art",
    retired: true,
    topic: "Art",
    questions: [
      "Do you like art?",
      "Do you like visiting art galleries?",
      "Do you want to be an artist?",
      "Do you like modern art or traditional art?"
    ]
  },
  {
    id: "sports-programs",
    retired: true,
    topic: "Sports programs",
    questions: [
      "Do you like watching sports programs on TV?",
      "Do you like to watch live sports games?",
      "Who do you like to watch sports games with?",
      "Do you prefer watching sports games alone or with friends?",
      "Have you ever watched a sports game in a stadium?",
      "What kinds of games do you expect to watch in the future?",
      "Do you prefer to watch sports games alone or with a group of friends?"
    ]
  },
  {
    id: "morning-routines",
    retired: true,
    topic: "Morning routines",
    questions: [
      "What do you do right after getting up in the morning?",
      "Is breakfast important?",
      "What is your morning routine?",
      "Do you like to get up early in the morning?"
    ]
  },
  {
    id: "evening-time",
    retired: true,
    topic: "Evening time",
    questions: [
      "Do you like the morning or evening?",
      "What do you usually do in the evening?",
      "What did you do in the evening when you were little?",
      "Do you do the same things in the evening on weekends and weekdays? Why?",
      "What do you hate doing in the evening?",
      "What did you do in the evening when you were little? Why?",
      "Are there any differences between what you do in the evening now and what you did in the past?",
      "Do you spend your evenings doing the same things on both weekends and weekdays? Why?"
    ]
  },
  {
    id: "old-buildings",
    retired: true,
    topic: "Old buildings",
    questions: [
      "Have you ever seen old buildings in the city?",
      "Do you think we should preserve old buildings in cities?",
      "Do you prefer living in an old building or a modern house?",
      "Are there any old buildings you want to see in the future? Why?"
    ]
  },
  {
    id: "films-cinemas",
    retired: true,
    topic: "Films / cinemas",
    questions: [
      "What films do you like?",
      "Did you often watch films when you were a child?",
      "Did you ever go to the cinema alone as a child?",
      "Do you often go to the cinema with your friends?",
      "How often do you watch films?",
      "Do you prefer to watch films at home or in the cinema?",
      "Do you think going to the cinema is a good way to spend time with friends?"
    ]
  },
  {
    id: "history",
    retired: true,
    topic: "History",
    questions: [
      "Have you ever been to historical museums?",
      "Do you like history?",
      "When was the last time you read about history?",
      "Did you like history when you were young?"
    ]
  },
  {
    id: "dream-ambition",
    retired: true,
    topic: "Dream and ambition",
    questions: [
      "What was your childhood dream?",
      "Are you the kind of person who sticks to dreams?",
      "What is your dream job?",
      "Do you think you are an ambitious person?",
      "What's your childhood dream?",
      "What's your dream job?"
    ]
  },
  {
    id: "views",
    retired: true,
    topic: "Views",
    questions: [
      "Do you like taking pictures of different views?",
      "Do you prefer views in urban areas or rural areas?",
      "Do you prefer views in your own country or in other countries?",
      "Have you seen an unforgettable and beautiful view or scenery?"
    ]
  },
  {
    id: "childhood-activities",
    retired: true,
    topic: "Childhood activities",
    questions: [
      "What are your favourite activities?",
      "What were your favourite activities when you were a child?",
      "Did you prefer to do activities alone or with a group of people when you were a child?"
    ]
  },
  {
    id: "building",
    retired: true,
    topic: "Building",
    questions: [
      "Are there tall buildings near your home?",
      "Do you take photos of buildings?",
      "Is there a building that you would like to visit?",
      "Do you want to live in a tall building?"
    ]
  },
  {
    id: "scenery",
    retired: true,
    topic: "Scenery",
    questions: [
      "Do you look out the window at the scenery when travelling by bus or car?",
      "Do you prefer the mountains or the sea?",
      "Do you take photos of the scenery outside the car window?",
      "What are the most beautiful sights you have seen while traveling?"
    ]
  },
  {
    id: "reading",
    retired: true,
    topic: "Reading",
    questions: [
      "Do you like reading?",
      "Do you prefer to read on paper or on a screen?",
      "When do you need to read carefully and when not?",
      "Do you prefer scanning or detailed reading?"
    ]
  },
  {
    id: "sports-team",
    retired: true,
    topic: "Sports team",
    questions: [
      "Have you ever been part of a sports team?",
      "Are team sports popular in your culture?",
      "Do you like watching team games? Why?",
      "What are the differences between team sports and individual sports?"
    ]
  },
  {
    id: "walking",
    retired: true,
    topic: "Walking",
    questions: [
      "Do you walk a lot?",
      "Did you often go outside to have a walk when you were a child?",
      "Why do people like to walk in parks?",
      "Where would you like to take a long walk if you had the chance?",
      "Where did you go for a walk lately?"
    ]
  },
  {
    id: "typing",
    retired: true,
    topic: "Typing",
    questions: [
      "Do you prefer typing or handwriting?",
      "Do you type on a desktop or laptop keyboard every day?",
      "When did you learn how to type on a keyboard?",
      "How do you improve your typing?"
    ]
  },
  {
    id: "food",
    retired: true,
    topic: "Food",
    questions: [
      "What is your favourite food?",
      "What kind of food did you like when you were young?",
      "Do you eat different foods at different times of the year?",
      "Has your favourite food changed since you were a child?",
      "Is there any food you dislike?"
    ]
  },
  {
    id: "spare-time",
    retired: true,
    topic: "Spare time",
    questions: [
      "Do you often have free time?",
      "What do you usually do in your spare time?",
      "Which day do you have more free time on, Saturday or Sunday?",
      "Would you like to have more free time in the future?"
    ]
  },
  {
    id: "hobby",
    retired: true,
    topic: "Hobby",
    questions: [
      "Do you have any hobbies?",
      "Did you have any hobbies when you were a child?",
      "Do you have a hobby that you've had since childhood?",
      "Do you have the same hobbies as your family members?"
    ]
  },
  {
    id: "life-stages",
    retired: true,
    topic: "Life stages",
    questions: [
      "What did you often do with your friends in your childhood?",
      "What do you think is the most important at the moment?",
      "Do you have any plans for the next five years?",
      "How do people remember each stage of their lives?",
      "Do you enjoy being the age you are now?",
      "At what age do you think people are the happiest?"
    ]
  },
  {
    id: "memory",
    retired: true,
    topic: "Memory",
    questions: [
      "Are you good at memorising things?",
      "Have you ever forgotten something important?",
      "What do you need to remember in your daily life?",
      "How do you remember important things?",
      "Are you good at remembering people's names?",
      "Will having a good memory help you in your future work?"
    ]
  },
  {
    id: "crowded-place",
    retired: true,
    topic: "Crowded place",
    questions: [
      "Is the city where you live crowded?",
      "Is there a crowded place near where you live?",
      "Do you like crowded places?",
      "Do most people like crowded places?",
      "When was the last time you were in a crowded place?"
    ]
  },
  {
    id: "gifts",
    retired: true,
    topic: "Gifts",
    questions: [
      "Have you ever sent handmade gifts to others?",
      "Have you ever received a great gift?",
      "What do you consider when choosing a gift?",
      "Do you think you are good at choosing gifts?",
      "What gift have you received recently?"
    ]
  },
  {
    id: "morning-time",
    retired: true,
    topic: "Morning time",
    questions: [
      "Do you like getting up early in the morning?",
      "What do you usually do in the morning?",
      "What did you do in the morning when you were little? Why?",
      "Are there any differences between what you do in the morning now and what you did in the past?",
      "Do you spend your mornings doing the same things on both weekends and weekdays? Why?"
    ]
  },
  {
    id: "pets-and-animals",
    retired: true,
    topic: "Pets and animals",
    questions: [
      "Are there many people keeping pets in your country?",
      "Should schools teach students knowledge about pets or animals?",
      "How often do you visit a zoo?",
      "Have you ever visited a zoo?",
      "What's your favourite animal? Why?",
      "Where do you prefer to keep your pet, indoors or outdoors?",
      "Have you ever had a pet before?",
      "What is the most popular animal in China?",
      "Do you often see birds?"
    ]
  },
  {
    id: "taking-photos",
    retired: true,
    topic: "Taking photos",
    questions: [
      "Do you like taking photos?",
      "Do you like taking selfies?",
      "What is your favourite family photo?",
      "Do you want to improve your photography skills?",
      "Where do you like to go to take photos?",
      "Do you want to be a photographer?",
      "Are there any clubs for students at your school?",
      "When do you feel happy at work? Why?"
    ]
  }
];

export const p2P3QuestionBank: P2P3QuestionSet[] = [
  {
    id: "a-successful-sportsperson-you-admire",
    topic: "a successful sportsperson you admire",
    p2Prompt: cueCard("Describe a successful sportsperson you admire", [
      "Who he/she is",
      "What you know about him/her",
      "What he/she is like in real life",
      "What achievement he/she has made",
      "And explain why you admire him/her"
    ]),
    p3Questions: [
      "Should students have physical education and do sports at school?",
      "What qualities should an athlete have?",
      "Is talent important in sports?",
      "Is it easy to identify children's talents?",
      "What is the most popular sport in your country?",
      "Why are there so few top athletes?"
    ]
  },
  {
    id: "a-popular-person",
    topic: "a popular person",
    p2Prompt: cueCard("Describe a popular person", [
      "Who this person is",
      "What kind of person he or she is",
      "When you see him/her normally",
      "And explain why you think this person is popular"
    ]),
    p3Questions: [
      "Why are some students popular in school?",
      "Is it important for a teacher to be popular?",
      "Do you think good teachers are always popular among students?",
      "What are the qualities of being a good teacher?",
      "Is it easier to become popular nowadays?",
      "Why do people want to be popular?"
    ]
  },
  {
    id: "a-sportsperson-who-did-well-in-an-event",
    topic: "a sportsperson who did well in an event",
    p2Prompt: cueCard("Describe a sportsperson who did well in an event", [
      "Who the sportsperson is",
      "What event he/she took part in",
      "How he/she performed in the event",
      "And explain why you think he/she performed well"
    ]),
    p3Questions: [
      "What sports are popular in your country?",
      "Do you think children should learn different kinds of sports?",
      "What can children learn from doing sports?",
      "What qualities does a successful sportsperson need？",
      "How is technology used in sports?",
      "How do athletes use technology to improve their performance?"
    ]
  },
  {
    id: "a-person-who-taught-you-a-new-skill",
    topic: "a person who taught you a new skill",
    p2Prompt: cueCard("Describe a person who taught you a new skill", [
      "Who this person was",
      "What the skill was",
      "How this person taught you",
      "And explain how you felt about learning this skill"
    ]),
    p3Questions: [
      "Why should children learn new skills?",
      "Where can children learn new skills?",
      "How can parents and teachers teach children new skills?",
      "How do adults learn a new skill?",
      "What are the differences between learning from a teacher and learning by oneself?",
      "Why is self-discipline important when learning a new skill?"
    ]
  },
  {
    id: "someone-you-know-who-enjoys-learning-about-history",
    topic: "someone you know who enjoys learning about history",
    p2Prompt: cueCard("Describe someone you know who enjoys learning about history", [
      "Who this person is",
      "How he/she learns history",
      "Why he/she loves history",
      "And explain how you feel about him/her"
    ]),
    p3Questions: [
      "Do you think children should begin learning history from an early age?",
      "At what age do you think people should begin to learn history?",
      "How do children learn history before they attend school?",
      "Is it important to learn how people in the past lived their lives?",
      "Do you think people should learn ancient history before learning modern history?",
      "Besides big historical events, what else is important when learning history?"
    ]
  },
  {
    id: "a-person-you-know-who-really-likes-taking-photos",
    topic: "a person you know who really likes taking photos",
    p2Prompt: cueCard("Describe a person you know who really likes taking photos", [
      "Who the person is",
      "When and how you got to know him/her",
      "Where he/she takes photos",
      "And explain how you feel about him/her"
    ]),
    p3Questions: [
      "Why are some people keen on taking photos?",
      "What kind of photos do people often take?",
      "Do you think it's ok to take photos everywhere?",
      "Why do tourists like taking photos while they are travelling?",
      "Some people don't mind others walking into their shot when they're taking photos. What do you think?",
      "When do people like taking photos?"
    ]
  },
  {
    id: "someone-who-is-older-than-you-that-you-admire",
    topic: "someone who is older than you that you admire",
    p2Prompt: cueCard("Describe someone who is older than you that you admire", [
      "Who this person is",
      "How you knew this person",
      "What kinds of things you like to do together",
      "and explain how you feel about this person"
    ]),
    p3Questions: [
      "What can young and old people learn from each other?",
      "Has the quality of life for old people improved compared to the past?",
      "Why is there a generation gap between the young and the old?",
      "What do old people usually do in their daily life?"
    ]
  },
  {
    id: "a-well-organized-person-you-know",
    topic: "a well-organized person you know",
    p2Prompt: cueCard("Describe a well-organized person you know", [
      "Who this person is",
      "What this person usually does to stay organized",
      "In what situations you have noticed this quality",
      "And explain why you think being organized is important to him/her"
    ]),
    p3Questions: [
      "Why is it important for people to be organized？",
      "Do you think children should learn to be organized from a young age？",
      "Should parents teach their children to be well-organized?",
      "Are organized people more likely to be successful at work or in their studies?",
      "Do you think it is important for managers to be well-organized?",
      "What can people do to become more organized?"
    ]
  },
  {
    id: "a-person-who-likes-to-make-things-by-hand-e-g-toys-furniture",
    topic: "a person who likes to make things by hand (e.g. toys, furniture)",
    p2Prompt: cueCard("Describe a person who likes to make things by hand (e.g. toys, furniture)", [
      "Who this person is",
      "What kinds of things this person makes",
      "How you know this person is good at making things",
      "And explain why you admire this person's skills"
    ]),
    p3Questions: [
      "What are the benefits for students to learn to make things by hand?",
      "Why do many children enjoy making things by hand?",
      "Do you think art classes are important for children?",
      "Do children nowadays still like doing arts and crafts?",
      "Is it good to have creative people in a team?",
      "Does art, like music or theater, have an impact on society?",
      "What impact can artistic buildings have on society?"
    ]
  },
  {
    id: "a-happy-person-you-know",
    topic: "a happy person you know",
    p2Prompt: cueCard("Describe a happy person you know", [
      "Who this person is",
      "What he/she is like",
      "How he/she shows happiness",
      "And explain why you think he/she is a happy person"
    ]),
    p3Questions: [
      "Should teachers know what children are doing all the time?",
      "Do you think teachers are able to spot the unhappy children?",
      "How can the arts spread positive emotions in society?",
      "When do you think people are happiest？",
      "What would make a student happy at school?",
      "Do you think doing a job that you like is more important than other things?"
    ]
  },
  {
    id: "a-person-you-know-who-did-something-difficult-and-was-succes",
    topic: "a person you know who did something difficult and was successful",
    p2Prompt: cueCard("Describe a person you know who did something difficult and was successful", [
      "Who this person is",
      "What difficult thing this person did",
      "Why this person was successful",
      "And explain how you feel about this person"
    ]),
    p3Questions: [
      "Is it difficult to run a business in today’s world?",
      "Is it easy to start up a company?",
      "How can companies help protect the environment?",
      "Other than making money, what is more important for a company?",
      "In which sectors are companies more likely to succeed in China?",
      "Does having money necessarily mean being successful?"
    ]
  },
  {
    id: "a-person-who-met-difficulties-but-succeeded",
    topic: "a person who met difficulties but succeeded",
    p2Prompt: cueCard("Describe a person who met difficulties but succeeded", [
      "Who this person is",
      "What difficulties he met",
      "How he overcame the difficulties",
      "And explain how you feel about him"
    ]),
    p3Questions: [
      "In your country, what industry is it easier to be successful in?",
      "What's the difference between ordinary people and successful people?",
      "What are the factors leading to people's success?"
    ]
  },
  {
    id: "a-time-when-you-sent-a-message-or-an-email-to-someone-bu",
    topic: "a time when you sent a message or an email to someone but received no reply for a long time",
    p2Prompt: cueCard("Describe a time when you sent a message or an email to someone but received no reply for a long time", [
      "Who you sent it to",
      "What the message/email was about",
      "Whether you finally received the reply",
      "And explain how you felt about the experience"
    ]),
    p3Questions: [
      "In what situations do people spend a long time responding to others' messages？",
      "In what situations do people not respond to messages right away?",
      "What would you do if you haven't received a reply after sending out a message?",
      "Why do some people prefer sending a message instead of making a call?",
      "Are you more polite when sending a message to a stranger than to a friend？",
      "Why do some people feel angry when others don't reply to their message?",
      "How do you show your respect in your message?"
    ]
  },
  {
    id: "languages-person",
    topic: "A person good at learning languages",
    p2Prompt: cueCard("Describe a person who is good at learning and speaking new languages", [
      "How you got to know him/her",
      "How he/she learns a new language",
      "What languages he/she can speak",
      "And explain how you feel about him/her"
    ]),
    p3Questions: [
      "Are there many people who can speak foreign languages in your country?",
      "Does speaking other languages help at work?",
      "Do people learn any languages other than English?",
      "Why is it easier for children to learn new things than for adults?",
      "How do people learn new things？",
      "What is the most important thing for learning a language well?"
    ]
  },
  {
    id: "successful-business-person",
    topic: "A person with a successful business",
    p2Prompt: cueCard("Describe a person you know who has a successful business", [
      "Who this person is",
      "How you got to know him/her",
      "Why and how he/she started the business",
      "What business he/she does",
      "And explain why you think the business is successful"
    ]),
    p3Questions: [
      "Why do some people start their own business?",
      "Should governments provide financial support to start-ups?",
      "Do most people prefer shopping at big stores or small stores?",
      "What makes a business successful?",
      "What makes a business fail?",
      "Is it easy to set up a new business in your country?"
    ]
  },
  {
    id: "a-person-you-know-who-would-like-to-choose-a-career-in-t",
    topic: "a person you know who would like to choose a career in the medical field",
    aliases: ["Describe a person you know who would like to choose a career in the medical field"],
    p2Prompt: cueCard("Describe a person you know who would like to choose a career in the medical field (e.g. a doctor, a nurse)", [
      "When you knew him/her",
      "When he/she started to think about that",
      "What he/she would like to do",
      "And explain why he/she would like to choose this career"
    ]),
    p3Questions: [
      "Do you think being a doctor is easy or difficult?",
      "Do you think learning biology is interesting for children?",
      "Why do some children want to become doctors?",
      "Do you think governments should put a large amount of money into medical research?",
      "Why do some doctors get paid more than others?",
      "Do you think doctors should be paid more?",
      "Why is some doctors' pay high and others' low?"
    ]
  },
  {
    id: "plant-lover",
    topic: "A person who loves growing plants",
    aliases: ["Describe a person who loves to grow plants at home or in the garden"],
    p2Prompt: cueCard("Describe a person who loves to grow plants (e.g. vegetables, flowers) at home or in the garden", [
      "Who this person is",
      "What plants he/she grows",
      "How he/she grows the plants",
      "And explain why he/she loves growing plants"
    ]),
    p3Questions: [
      "What are the advantages of growing vegetables or flowers at home?",
      "Do many people grow vegetables or flowers at home in your country?",
      "Is it easy to grow plants at home?",
      "Why do some people like to grow plants?",
      "Why do some people prefer to grow their own fruits and vegetables instead of buying them from the market?",
      "Do you think students should learn to grow plants?",
      "Why do people like to grow plants?",
      "Do you think students should learn to grow plant?"
    ]
  },
  {
    id: "childhood-friend",
    topic: "A childhood friend",
    p2Prompt: cueCard("Describe a friend from your childhood", [
      "Who he/she is",
      "Where and how you met each other",
      "What you often did together",
      "And explain what made you like him/her"
    ]),
    p3Questions: [
      "Do you still keep in touch with your friends from childhood? Why or why not?",
      "How important is childhood friendship to children?",
      "What do you think of communicating with others through social media?",
      "Do you think online communication through social media will replace face-to-face communication?",
      "What's the difference between talking to friends and family?",
      "Has technology changed people's friendships? How?",
      "What do you think of communicating via social media?",
      "What's the difference between having younger friends and older friends?"
    ]
  },
  {
    id: "a-person-whose-health-and-fitness-you-have-helped-to-improve",
    topic: "a person whose health and fitness you have helped to improve",
    p2Prompt: cueCard("Describe a person whose health and fitness you have helped to improve", [
      "Who this person was",
      "Why you helped him/her",
      "How you helped him/her",
      "And explain whether it was easy or difficult"
    ]),
    p3Questions: [
      "Which group pays more attention to health, young people or old people?",
      "What effect does stress have on health?"
    ]
  },
  {
    id: "a-party-for-a-special-event-that-impressed-you-a-lot",
    topic: "a party for a special event that impressed you a lot",
    p2Prompt: cueCard("Describe a party for a special event that impressed you a lot", [
      "When and where it was held",
      "What the party was held for",
      "How many people attended it",
      "And explain why it impressed you a lot"
    ]),
    p3Questions: [
      "When do people like to hold a party?",
      "Do most people prefer to hold a party in a public place or a private place?",
      "Do most people prefer to hold a party in a restaurant or in a pub?",
      "What special events are celebrated in your country?"
    ]
  },
  {
    id: "a-short-trip-you-often-take-but-do-not-enjoy",
    topic: "a short trip you often take but do not enjoy",
    p2Prompt: cueCard("Describe a short trip you often take but do not enjoy", [
      "Where you go",
      "When you go there",
      "Why you go there",
      "And explain why you do not enjoy the trip"
    ]),
    p3Questions: [
      "Do Chinese people like travelling abroad?",
      "Who prefers travelling abroad, younger people or older people?",
      "How much time do you think people should spend on a trip abroad?",
      "Which is a better way to learn about a country: travelling there or reading books about it?"
    ]
  },
  {
    id: "a-time-when-someone-talked-about-something-you-were-not-inte",
    topic: "a time when someone talked about something you were not interested in, but you continued listening",
    p2Prompt: cueCard("Describe a time when someone talked about something you were not interested in, but you continued listening", [
      "Who the person was",
      "What they talked about",
      "Why you continued listening",
      "How you felt about the experience"
    ]),
    p3Questions: [
      "What kinds of topics do young people like to talk about nowadays？",
      "What might happen if someone does not listen carefully during a conversation?",
      "How can we tell whether someone is listening attentively?"
    ]
  },
  {
    id: "an-enjoyable-evening-with-your-friends",
    topic: "an enjoyable evening with your friends",
    p2Prompt: cueCard("Describe an enjoyable evening with your friends", [
      "When and where it was",
      "Who you spent the evening with",
      "What you did",
      "And explain why you think it was an enjoyable evening"
    ]),
    p3Questions: [
      "Is it important to communicate with your family?",
      "What do you usually do with your friends in the evening",
      "What are the differences between what old people and young people do in the evening?",
      "How can members of a large family maintain good relationships with one another?"
    ]
  },
  {
    id: "a-time-when-you-saved-money-to-buy-something-special",
    topic: "a time when you saved money to buy something special",
    p2Prompt: cueCard("Describe a time when you saved money to buy something special", [
      "What the special item was",
      "Why you wanted to buy it",
      "How you saved money for it",
      "And explain how you felt after buying it."
    ]),
    p3Questions: [
      "Should schools teach children how to manage money?",
      "Should parents encourage their children to spend money freely or to be careful with it?",
      "Is it easier to teach teenagers how to manage money when they are 16 or 17 years old?",
      "Which one do you think is easier, saving money or spending money?",
      "What kind of things do people usually save money for？",
      "Should people give their time to charity, or just money?"
    ]
  },
  {
    id: "a-new-skill-you-learned-when-you-were-a-child",
    topic: "a new skill you learned when you were a child",
    p2Prompt: cueCard("Describe a new skill you learned when you were a child", [
      "What the skill was",
      "Who taught you this skill",
      "How you learned it",
      "And explain how you felt about learning the skill"
    ]),
    p3Questions: [
      "What skills should children learn before they go to school?",
      "What are the differences between learning in a group and learning by yourself?",
      "Do you think it is easier for children to learn new skills than for adults?",
      "What are the differences between children learning skills and adults learning skills?",
      "Can a child learn skills from another child?",
      "Is it important for everyone to have a specialized skill?"
    ]
  },
  {
    id: "a-time-you-watched-a-famous-person-being-interviewed",
    topic: "a time you watched a famous person being interviewed",
    p2Prompt: cueCard("Describe a time you watched a famous person being interviewed", [
      "Who the famous person was",
      "What the interview was about",
      "When and where you watched the interview",
      "And explain how you felt about the interview"
    ]),
    p3Questions: [
      "What kinds of people are frequently interviewed?",
      "Why do some people dislike being interviewed?",
      "Why do some people think interviews are a waste of time?",
      "What kinds of things do famous people often say in an interview?",
      "What can we do to get a job interview?",
      "What should people do to prepare for a job interview?",
      "Why do we need to attend interviews when applying for jobs?",
      "What should people wear to a job interview?"
    ]
  },
  {
    id: "a-time-when-you-made-an-important-decision-and-were-happy-wi",
    topic: "a time when you made an important decision and were happy with the result",
    p2Prompt: cueCard("Describe a time when you made an important decision and were happy with the result", [
      "What the decision was",
      "Why you made that decision",
      "How easy or difficult it was to make",
      "Why you were happy with the result"
    ]),
    p3Questions: [
      "How can we tell whether a decision is important or simply routine?",
      "Do you think it is a good idea to make small decisions for yourself every day?",
      "What kinds of small decisions do people make every day?",
      "What should people do when members of a group have different opinions about a decision?",
      "Do you think most of the important decisions in people’s lives are made in their twenties?",
      "Is it better to make a decision quickly or to take time to think it through?"
    ]
  },
  {
    id: "recent-change",
    topic: "A change you made recently",
    p2Prompt: cueCard("Describe a change that you made recently", [
      "What the change was",
      "What caused the change",
      "What you did for the change",
      "And explain how you feel about the change"
    ]),
    p3Questions: [
      "Do you think it is good to change one's daily routine?",
      "Do you think it is good to change jobs?",
      "Is it good for people to get a job promotion？",
      "Do people often make plans around their regular routines?",
      "Who tends to change their daily routine more, young people or old people?",
      "Who tend to change their daily routine more, young people or old people?"
    ]
  },
  {
    id: "a-time-when-you-changed-an-important-opinion-of-yours",
    topic: "a time when you changed an important opinion of yours",
    p2Prompt: cueCard("Describe a time when you changed an important opinion of yours", [
      "When you changed your opinion",
      "What the original opinion was",
      "Why you changed it",
      "And explain how you felt about the experience"
    ]),
    p3Questions: [
      "When do most children begin to have their own opinions?",
      "Whose opinions are more important to children, their parents' or teachers'?",
      "Do children communicate more with teachers or with parents?",
      "Who do young people like to share opinions with?"
    ]
  },
  {
    id: "important-decision",
    topic: "An important decision",
    p2Prompt: cueCard("Describe an important decision that you made", [
      "What the decision was",
      "How you made your decision",
      "What the results of the decision were",
      "And explain why it was important"
    ]),
    p3Questions: [
      "Do you think children sometimes have to make important decisions?",
      "What important decisions do teenagers need to make after graduation?",
      "Who can children turn to for help when making a decision?",
      "Do you think advertisements can influence our decisions when shopping?",
      "Do you think the influence of advertising is good?",
      "How do people usually make important decision?",
      "How do people usually make important decisions?"
    ]
  },
  {
    id: "changed-plan",
    topic: "A plan you changed recently",
    p2Prompt: cueCard("Describe a plan that you had to change recently", [
      "When this happened",
      "What made you change the plan",
      "What the new plan was",
      "And how you felt about the change"
    ]),
    p3Questions: [
      "Do people often change their plans?",
      "Would you tell others if you change your plan?",
      "Why do you think parents still make plans for their children nowadays?",
      "How does technology help people make plans?",
      "What kind of plans do people often make?",
      "Do you think people like the process of making plans more, or the moment of carrying them out?",
      "How would you tell your friends when you must change plans?",
      "What are the common reasons when people need to change plans?",
      "What kind of plans are practical?"
    ]
  },
  {
    id: "a-time-when-a-person-did-something-to-help-you-solve-a-p",
    topic: "a time when a person did something to help you solve a problem",
    p2Prompt: cueCard("Describe a time when a person did something to help you solve a problem", [
      "Who the person is",
      "What the problem was",
      "How he/she helped you",
      "And explain how you felt about the experience"
    ]),
    p3Questions: [
      "How important is it for schools to help children become smarter?"
    ]
  },
  {
    id: "technological-problem",
    topic: "A challenging technological problem",
    p2Prompt: cueCard("Describe a challenging technological problem you faced", [
      "What the problem was",
      "When and where you faced it",
      "How challenging it was",
      "And explain how you solved it"
    ]),
    p3Questions: [
      "What are the advantages and disadvantages of AI?",
      "Do you think people today should learn about AI technology?",
      "Should children learn to use AI?",
      "How can AI help in our lives?",
      "Do you think students are overly reliant on AI?",
      "What can teachers do to stop students relying too much on AI?"
    ]
  },
  {
    id: "local-news",
    topic: "A piece of local news",
    p2Prompt: cueCard("Describe a piece of local news that people are interested in", [
      "What it was about",
      "Where you saw/heard it",
      "Who was involved",
      "And explain why people were interested in it"
    ]),
    p3Questions: [
      "Are there a lot of people talking about local news?",
      "Do young people or the elderly care more about local news?",
      "Do people in your country prefer following local news or national news?",
      "Why do some people want to be very involved in their community?",
      "Do you think local communities were stronger in the past than they are today?",
      "Do you think it is important to have a national identity?",
      "How can people develop their national identity?",
      "Do people read the newspaper where you live?",
      "Do people prefer local or international news?",
      "Do you think it's important to have a national identity?"
    ]
  },
  {
    id: "live-sports-event",
    topic: "A live sports event",
    aliases: ["Describe a live sports event you watched and liked"],
    p2Prompt: cueCard("Describe a live sport match you have ever watched", [
      "What it was",
      "When you watched",
      "What it was like",
      "And explain how you felt about it"
    ]),
    p3Questions: [
      "Why do some people like to watch sports events?",
      "Where do people normally watch sports events?",
      "What are the advantages of watching sports events online?",
      "What are the main differences between watching a sports event live in a stadium and watching it on TV?",
      "What kinds of sports events are most popular to watch in your country?",
      "What types of sports matches are suitable for children to watch?",
      "What types of sports matches are suitable for children to attend?",
      "Why do some people spend a lot going to other countries to watch sports events?",
      "What sports games are popular in your country?",
      "What sports matches are suitable for children to attend?"
    ]
  },
  {
    id: "worked-in-group",
    topic: "Working in a group",
    p2Prompt: cueCard("Describe a time when you worked in a group", [
      "What you did",
      "Who you worked with",
      "What problems you faced",
      "And explain why you worked in the group"
    ]),
    p3Questions: [
      "Why do some people prefer to work by themselves?",
      "What should a leader do to make team members want to follow him or her?",
      "Should students learn to do group work?",
      "What group tasks are there in schools?",
      "What advantages are there for students experiencing teamwork at school?",
      "How can you tell if a person is a good leader?"
    ]
  },
  {
    id: "got-up-early",
    topic: "Getting up early",
    p2Prompt: cueCard("Describe a time when you got up early", [
      "When it was",
      "What you did",
      "Why you got up early",
      "And how you felt about it"
    ]),
    p3Questions: [
      "Do you know anyone who likes to get up early?",
      "Why do people get up early？",
      "What kinds of occasions need people to arrive early?",
      "Why do some people like to stay up late?",
      "Is it good to arrive early in any situation?",
      "What kind of people like getting up early?",
      "Is the early morning the best part of the day?",
      "Why do some people think it’s important to be on time and others don’t?",
      "What kind of plans do people often make?",
      "Do you think people like the process of making plans more, or the moment of carrying them out?"
    ]
  },
  {
    id: "long-term-goal",
    topic: "A long-term goal or ambition",
    p2Prompt: cueCard("Describe a long-term goal/ambition you would like to achieve", [
      "How long you have had this goal/ambition",
      "What it is",
      "How you will achieve it",
      "And explain why you set it"
    ]),
    p3Questions: [
      "What kinds of ambitions do people have?",
      "Why should parents encourage children to have ambitions？",
      "Should parents interfere with their children's ambitions?",
      "Is there any difference between children's ambitions and those of grown-ups?",
      "What goals do young people usually have?",
      "Why are young people ambitious for higher positions?",
      "What should people do to achieve their goals?",
      "Why should children have ambitions?",
      "What do you think of people going after high positions?",
      "Is it good for a person to be ambitious?",
      "Why are some young people keen on being fans of superstars?",
      "Do you think it is necessary to be ambitious when working in a team in a company?",
      "Should parents support their children in pursuing their ambitions?",
      "What goals should a society have?",
      "Do people need to have goals?",
      "What goals do people at your age have?",
      "Is it necessary to give advice to children?"
    ]
  },
  {
    id: "a-building-you-enjoy-visiting-e-g-a-library-a-shopping-mall",
    topic: "a building you enjoy visiting (e.g. a library, a shopping mall, etc.)",
    p2Prompt: cueCard("Describe a building you enjoy visiting (e.g. a library, a shopping mall, etc.)", [
      "Where it is",
      "How you knew it",
      "What it looks like",
      "And explain why you enjoy visiting it"
    ]),
    p3Questions: [
      "Do you think old buildings are valuable?",
      "Do you think all old buildings should be demolished?"
    ]
  },
  {
    id: "a-crowded-place-you-went-to",
    topic: "a crowded place you went to",
    p2Prompt: cueCard("Describe a crowded place you went to", [
      "Where it was",
      "When you went there",
      "Who you went there with",
      "What you did there",
      "And how you felt about it"
    ]),
    p3Questions: [
      "Which cities in your country are particularly overcrowded?",
      "Do you think cities will have more or less green space in the future?",
      "Do you think people will use bicycles more or less frequently in cities in the future?",
      "Why do people go to crowded places?",
      "Why do some people enjoy being in crowded places?",
      "Do you think the continued growth of large cities is a positive trend?"
    ]
  },
  {
    id: "a-natural-place-in-your-city-that-you-enjoy-visiting",
    topic: "a natural place in your city that you enjoy visiting",
    p2Prompt: cueCard("Describe a natural place in your city that you enjoy visiting", [
      "Where it is",
      "What it is like",
      "How often you go there",
      "Who you often go there with",
      "And explain why you enjoy visiting there"
    ]),
    p3Questions: [
      "Do you think there should be many natural places in cities?",
      "Do you think staying in a natural place would help change people's mood?",
      "Which is more important, protecting the environment or developing the economy?"
    ]
  },
  {
    id: "a-noisy-place-you-have-been-to",
    topic: "a noisy place you have been to",
    p2Prompt: cueCard("Describe a noisy place you have been to", [
      "Where it is",
      "When you went there",
      "What you did there",
      "And explain why you feel it's a noisy place"
    ]),
    p3Questions: [
      "Do you think it is good for children to make noise?",
      "Should children not be allowed to make noise under any circumstances?",
      "What kinds of noises are there in our life?",
      "Which area is exposed to noise more, the city or the countryside?",
      "How would people usually respond to noises in your country？",
      "How can people consider others' feelings when chatting in public?"
    ]
  },
  {
    id: "home-to-visit",
    topic: "A home you like to visit",
    p2Prompt: cueCard("Describe a home that you like to visit but do not want to live in", [
      "Where it is",
      "What it is like",
      "Why you like to visit it",
      "And explain why you would not like to live there"
    ]),
    p3Questions: [
      "Do Chinese people like to visit others’ homes？",
      "What do Chinese people do when they visit others?",
      "What kind of place do people in your country like to live in?",
      "What’s the difference between homes in cities and those in the countryside?",
      "What kind of gifts do people usually bring when they visit others?",
      "How often do you visit your relatives or friends?"
    ]
  },
  {
    id: "recommended-place",
    topic: "A place you recommend for travel",
    p2Prompt: cueCard("Describe a place you have travelled to that you would like to recommend to others", [
      "What it is",
      "Where it is",
      "What you saw and did there",
      "And explain why you would like to recommend it to others"
    ]),
    p3Questions: [
      "Where do people in your country often go for holidays?",
      "Where do young people in your country often go for holidays?",
      "What is the ideal length for a holiday?",
      "How do people usually plan holidays?",
      "Is it important to plan a holiday ahead?",
      "Why do many countries try to attract people to visit?",
      "How do people decide when to travel？",
      "What are the benefits for cities of having lots of tourists?",
      "What are the disadvantages for people living in popular tourist cities?"
    ]
  },
  {
    id: "boring-place",
    topic: "A boring place",
    p2Prompt: cueCard("Describe a boring place", [
      "Where it is",
      "Who you went there with",
      "What you did there",
      "And explain why you think it is a boring place"
    ]),
    p3Questions: [
      "Why do most children think education is boring?",
      "Why aren't young people willing to listen to the experiences of older people?",
      "What can people do when they feel bored?",
      "Why are some teachers' classes boring? Are there any solutions?",
      "Why do some young people feel bored when talking with old people?",
      "Do most people think news about celebrities is boring?",
      "Why are some teachers' classes boring?"
    ]
  },
  {
    id: "tall-building",
    topic: "A tall building",
    p2Prompt: cueCard("Describe a tall building you like or dislike", [
      "What it is used for",
      "Where it is",
      "What it looks like",
      "And explain why you like/dislike it"
    ]),
    p3Questions: [
      "Are there many tall buildings in your country?",
      "What are the differences between those tall buildings in your country?",
      "Why are different places laid out and designed differently?",
      "What are the advantages of living in tall buildings?",
      "Why do some people like to remodel and decorate their homes themselves?",
      "What kind of interior design style do most people like?"
    ]
  },
  {
    id: "a-way-change-that-helps-you-save-a-lot-of-time",
    topic: "a way/change that helps you save a lot of time",
    p2Prompt: cueCard("Describe a way/change that helps you save a lot of time", [
      "What it is",
      "How you implement it",
      "How difficult it is",
      "And explain how you feel about the way/change"
    ]),
    p3Questions: [
      "Is it necessary for children to learn time management?",
      "What can schools do to help students learn time management?",
      "What can people do to save time?",
      "Does technology help people save time? How and why?",
      "Do you think parents should be responsible for teaching children to save time?",
      "Do people who can manage time well become successful more easily?"
    ]
  },
  {
    id: "your-least-favourite-movie",
    topic: "your least favourite movie",
    p2Prompt: cueCard("Describe your least favourite movie", [
      "When you watched it",
      "Where you watched it",
      "What it was about",
      "And explain why it’s your least favourite movie"
    ]),
    p3Questions: [
      "What kinds of movies are the most popular in China?",
      "What are the differences between watching movies at home and in a cinema?",
      "Are movies more likely to help people become more creative than books?",
      "Can movies help people better understand the cultural background of a country?"
    ]
  },
  {
    id: "an-activity-you-do-regularly-that-you-think-is-a-waste-of-ti",
    topic: "an activity you do regularly that you think is a waste of time",
    p2Prompt: cueCard("Describe an activity you do regularly that you think is a waste of time", [
      "What it is",
      "When you usually do it",
      "Why you do it",
      "And explain why you think it is a waste your time"
    ]),
    p3Questions: [
      "How do you balance life and work?",
      "Will you continue doing something when you are aware that it's a waste of time?",
      "What kinds of things make people feel pressured?",
      "Why do some people refuse to abide by rules?",
      "Do you think stress is important in people's lives?",
      "Is it good to have a daily routine?"
    ]
  },
  {
    id: "an-exciting-book-that-you-enjoyed-reading",
    topic: "an exciting book that you enjoyed reading",
    p2Prompt: cueCard("Describe an exciting book that you enjoyed reading", [
      "What kind of book it was",
      "Why you decided to read it",
      "What the book was about",
      "Why you found it exciting"
    ]),
    p3Questions: [
      "What kinds of books do people in your country enjoy reading?",
      "What kinds of books do young and older people enjoy?",
      "Do boys and girls tend to enjoy different kinds of books?",
      "Do you think it is important to read a book before watching its film adaptation?",
      "Why are films based on books sometimes disappointing?",
      "Can films based on novels encourage people to read more?"
    ]
  },
  {
    id: "a-time-when-you-received-good-service-from-a-staff-member-in",
    topic: "a time when you received good service from a staff member in a shop",
    p2Prompt: cueCard("Describe a time when you received good service from a staff member in a shop", [
      "Where the shop is",
      "When you went to the shop",
      "What service you received from the staff",
      "And explain how you felt about the service"
    ]),
    p3Questions: [
      "Why are shopping malls so popular in China?",
      "What are the advantages and disadvantages of shopping in small shops?",
      "Why do some people not like shopping in small shops?",
      "What are the differences between online shopping and in-store shopping?",
      "What are the advantages and disadvantages of shopping online?",
      "Can consumption drive economic growth?",
      "Why is customer service not good in some shops?",
      "Do you think good service is important?",
      "Do the most expensive shops have the best service?",
      "Why should companies react quickly when customers have difficulties?"
    ]
  },
  {
    id: "an-environmental-law-you-would-like-your-country-to-intr",
    topic: "an environmental law you would like your country to introduce",
    p2Prompt: cueCard("Describe an environmental law you would like your country to introduce", [
      "What law it should be",
      "Why people should follow the law",
      "Whether the law will be popular",
      "And explain how you feel about this law"
    ]),
    p3Questions: [
      "What kind of rules do schools in China have?",
      "How does technology affect the law?",
      "Will there be a law that is universally accepted?",
      "What environmental laws does your country already have?",
      "What kinds of rules do schools in China have?"
    ]
  },
  {
    id: "animals-story-book",
    topic: "A story or book with animals",
    p2Prompt: cueCard("Describe a story/book with animals in it", [
      "What animals are in it",
      "What the story/book is about",
      "Why you read the story/book",
      "And explain what you think of this story/book"
    ]),
    p3Questions: [
      "Should schools teach children about animals?",
      "Some people think pets should not be kept in cities. What do you think?",
      "Many people regard pets as members of their family. What do you think?",
      "Do many people keep pets in your country?",
      "What are the advantages of keeping a pet?",
      "Why do people allows tell children stories with animals?",
      "What do you think about keeping animals as pets?",
      "Why do people always tell children stories with animals?"
    ]
  },
  {
    id: "celebrity-advertisement",
    topic: "An advertisement with a famous person",
    p2Prompt: cueCard("Describe an advertisement with a famous person in it", [
      "Who the person is",
      "Where you can see it",
      "What the advertisement is about",
      "And explain how you feel about the advertisement"
    ]),
    p3Questions: [
      "What are the advantages and disadvantages of advertisements?",
      "Why are many advertisements endorsed by celebrities? How useful are they?",
      "What is the most important factor in an advertisement?",
      "Why are some advertisements boring?",
      "Is advertising important for a company? Why?",
      "Which is more effective, online advertising or offline advertising?",
      "Why are many advertisements endorsed by celebrities?",
      "How useful are they?"
    ]
  },
  {
    id: "a-food-that-people-eat-on-special-occasions-events",
    topic: "a food that people eat on special occasions/events",
    aliases: ["Describe a food that people eat on special occasions/events"],
    p2Prompt: cueCard("Describe a kind of food that you ate at special occasions", [
      "What it is",
      "What occasion it was",
      "Why you would like to eat it",
      "And explain how you feel about it"
    ]),
    p3Questions: [
      "Why do people eat special food on special occasions or festivals?",
      "What are the differences between everyday food and festival food?",
      "Are there any differences between the food people eat today and the food people ate in the past?",
      "Do people today prefer eating at home or in a restaurant?",
      "What kinds of food are popular in your country?",
      "Do people in your country like eating foreign food?",
      "Why are there special foods on special occasions or events?"
    ]
  },
  {
    id: "new-law",
    topic: "A new law",
    p2Prompt: cueCard("Describe a new law you would like to introduce in your country", [
      "What law it is",
      "What changes this law has",
      "Whether this new law will be popular",
      "How you came up with the new law",
      "And explain how you feel about this new law"
    ]),
    p3Questions: [
      "What rules should students follow at school?",
      "Do people in your country usually obey the law?",
      "What kinds of behavior are considered as good behavior?",
      "Do you think children can learn about the law outside of school?",
      "What are the benefits for people if they obey the rules?",
      "How can parents teach children to obey rules?",
      "What kinds of behavior are considered good behavior?",
      "What are the benefits for people to obey rules?"
    ]
  },
  {
    id: "interesting-video",
    topic: "An interesting video",
    p2Prompt: cueCard("Describe an interesting video", [
      "When and where you watched it",
      "What it is about",
      "Why you watched it",
      "And explain how you feel about it"
    ]),
    p3Questions: [
      "What kind of videos do people in your country like to watch?",
      "Which is more helpful, watching videos or reading books?",
      "What skills can people learn from watching videos?",
      "What are the advantages of online learning?",
      "Are there any differences between the videos that young people and old people like to watch?",
      "Are there any differences between the videos that young men and young women like to watch?",
      "What makes a video go viral online?"
    ]
  },
  // ---- Retired (2026 年 5–8 月) ----
  {
    id: "environmental-law",
    retired: true,
    topic: "An environmental protection law",
    p2Prompt: cueCard("Describe a law on environmental protection", [
      "What it is",
      "How you first learned about it",
      "Who benefits from it",
      "And explain how you feel about this law"
    ]),
    p3Questions: [
      "What kinds of rules do schools in China have?",
      "Do you think school rules are important?",
      "Are children unhappy with school rules?",
      "What are the rules people should obey at work?",
      "What is the purpose of punishment?",
      "Are children unhappy with the school rules?"
    ]
  },
  {
    id: "language-learning-activity",
    retired: true,
    topic: "Something you did to learn another language",
    p2Prompt: cueCard("Describe a thing you did to learn another language", [
      "What language you learned",
      "What you did",
      "How it helped you learn the language",
      "And how you felt about it"
    ]),
    p3Questions: [
      "Do you think language learning is important? Why?",
      "Is it better to learn a language alone or in a group? Why?",
      "Some people think it is unnecessary to learn languages. What do you think?",
      "What difficulties do people face when learning a language?",
      "Which is better, to study a language alone or to study it in a group? Why?",
      "What's the best way to learn a language?",
      "What are the advantages and disadvantages of learning a language?",
      "Some people think that technology has made it unnecessary to learn languages. What do you think?"
    ]
  },
  {
    id: "organized-happy-event",
    retired: true,
    topic: "Organizing a happy event",
    p2Prompt: cueCard("Describe a time when you organized a happy event successfully", [
      "What the event was",
      "How you prepared for it",
      "Who helped you to organize it",
      "And explain why you think it was a successful event"
    ]),
    p3Questions: [
      "How can parents help children to be organized?",
      "Does everything need to be well prepared?",
      "Do people need others' help when organizing things?",
      "How would you feel when you were not well prepared for something?",
      "Do you prefer to prepare and organize an activity or just take part in an activity?"
    ]
  },
  {
    id: "important-river-lake",
    retired: true,
    topic: "An important river or lake",
    p2Prompt: cueCard("Describe an important river/lake in your country", [
      "Where it is located",
      "How big/long it is",
      "What it looks like",
      "And explain why it is important"
    ]),
    p3Questions: [
      "Are rivers and lakes important to a country?",
      "What are the popular water sports in your country?",
      "Are rivers and lakes good for transport? Why?",
      "How do rivers and lakes affect local tourism?",
      "Do you think rivers and lakes attract tourists?",
      "How can rivers and lakes benefit local people?"
    ]
  },
  {
    id: "traffic-jam",
    retired: true,
    topic: "A long traffic jam",
    p2Prompt: cueCard("Describe a time when you were stuck in a traffic jam for a very long time", [
      "When it happened",
      "Where you were stuck",
      "What you did while waiting",
      "And explain how you felt in the traffic jam"
    ]),
    p3Questions: [
      "How can we solve the traffic jam problem?",
      "Do you think highways will help reduce traffic jams?",
      "What are good ways to manage traffic?",
      "Do you like to use public transport?",
      "Would you rather be in a car or a bus in a traffic jam?",
      "Do you think developing public transport can solve traffic jam problems?",
      "Do you think the high ways will help reduce traffic jams?"
    ]
  },
  {
    id: "cheap-day-out",
    retired: true,
    topic: "A special day out that cost little money",
    p2Prompt: cueCard("Describe a special day out that cost you little money or did not cost you much", [
      "When the day was",
      "Where you went",
      "How much you spent",
      "And explain how you feel about the day"
    ]),
    p3Questions: [
      "How do people spend their leisure time in your country?",
      "Why do people like to have days off?",
      "Do you think only old people have time for leisure?"
    ]
  },
  {
    id: "a-special-cake-you-received-from-others",
    retired: true,
    topic: "a special cake you received from others",
    p2Prompt: cueCard("Describe a special cake you received from others", [
      "When it happened",
      "Where it happened",
      "Who you got the cake from",
      "And explain why it's a special cake"
    ]),
    p3Questions: [
      "What are the differences between special food in China and other countries?",
      "Is there any food in your country that is eaten at special times or on special occasions?",
      "Why are some people willing to spend a lot of money on meals on special days?",
      "Do you think it's good to communicate when eating with your family?",
      "In your country, do people nowadays cook at home as frequently as people did in the past?",
      "What do you think of people using their mobile phones during a meal?"
    ]
  },
  {
    id: "a-person-who-works-in-a-successful-company",
    retired: true,
    topic: "a person who works in a successful company",
    p2Prompt: cueCard("Describe a person who works in a successful company", [
      "Who he/she is",
      "What he/she does in the company",
      "What business the company does",
      "And explain why you think it is a successful company"
    ]),
    p3Questions: [
      "Do you think governments should provide financial support to companies?",
      "Do you think companies should donate money to help society?",
      "Do you think customer satisfaction is important for a company?"
    ]
  },
  {
    id: "a-place-you-would-like-to-visit-in-your-free-time",
    retired: true,
    topic: "a place you would like to visit in your free time",
    p2Prompt: cueCard("Describe a place you would like to visit in your free time", [
      "Where it is",
      "What you will do there",
      "How long you will stay there",
      "And explain why you would like to visit it"
    ]),
    p3Questions: [
      "Why do you think some people choose not to travel abroad?",
      "Do you think a gap period in life is important?"
    ]
  },
  {
    id: "a-special-day-out-that-cost-you-little-money-didn-t-cost",
    retired: true,
    topic: "a special day out that cost you little money/didn't cost you much",
    p2Prompt: cueCard("Describe a special day out that cost you little money/didn't cost you much", [
      "When the day was",
      "Where you went",
      "How much you spent",
      "And explain how you feel about the day"
    ]),
    p3Questions: [
      "Do people like to spend their leisure time out in your country?",
      "How do people spend their leisure time in your country?",
      "How does technology affect the way people spend their leisure time?",
      "Do you think only old people have time for leisure?",
      "Why do people like to have days off?",
      "Going out to have holidays is tiring. Why do people still want to do it?"
    ]
  },
  {
    id: "a-time-when-you-had-a-problem-with-using-an-electronic-d",
    retired: true,
    topic: "a time when you had a problem with using an electronic device",
    p2Prompt: cueCard("Describe a time when you had a problem with using an electronic device", [
      "When it happened",
      "Where it happened",
      "What the problem was",
      "And explain how you solved the problem at last"
    ]),
    p3Questions: [
      "Why are people keen on buying new electronic?",
      "What impact do electronic devices have on people?"
    ]
  },
  {
    id: "a-tv-show-online-program-you-have-watched-recently",
    retired: true,
    topic: "a TV show/online program you have watched recently",
    p2Prompt: cueCard("Describe a TV show/online program you have watched recently", [
      "What it is",
      "What it is about",
      "How often you watch it",
      "And explain how you feel about it"
    ]),
    p3Questions: [
      "What are the differences between the TV programs young people like to watch and those old people like to watch?",
      "What makes a popular TV or online program?",
      "What kinds of TV or online programs are popular in your country?"
    ]
  },
  {
    id: "your-favorite-city-that-you-have-visited",
    retired: true,
    topic: "your favorite city that you have visited",
    p2Prompt: cueCard("Describe your favorite city that you have visited", [
      "Where it is",
      "How you knew it",
      "When you visited it",
      "And explain why it is your favourite city"
    ]),
    p3Questions: [
      "Which is more suitable for young people, urban life or rural life, and which is more suitable for old people?",
      "How do people choose a city to travel to?",
      "Do you think a tourist city is also a good place to live? Why?",
      "Do most people prefer to travel in a modern city or a historical city?"
    ]
  },
  {
    id: "a-city-you-enjoyed-visiting",
    retired: true,
    topic: "a city you enjoyed visiting",
    p2Prompt: cueCard("Describe a city you enjoyed visiting", [
      "Where it is",
      "When you visited it",
      "How long you stayed there",
      "What you did there",
      "And explain why you enjoyed visiting it"
    ]),
    p3Questions: [
      "What kinds of facilities do big cities have?",
      "Do you think modern cities are suitable for young people or old people?",
      "What are the disadvantages of living in a very famous city?",
      "Do you prefer to visit well-developed cities or cities with a long history?"
    ]
  },
  {
    id: "a-person-who-likes-to-look-after-the-natural-world",
    retired: true,
    topic: "a person who likes to look after the natural world",
    p2Prompt: cueCard("Describe a person who likes to look after the natural world", [
      "Who this person is",
      "What he or she does",
      "How he or she does it",
      "How often he or she does it",
      "And explain how you feel about this person"
    ]),
    p3Questions: [
      "Do you think parents should teach their children how to protect the environment?",
      "What laws about the environment are effective in your country?",
      "Which do you think people prefer, rewards or punishment, when it comes to government intervention in environmental protection?",
      "Is it easy for children in cities to get close to the natural world?",
      "What can people do to protect the natural world?",
      "Is it important to teach students environmental protection at school?"
    ]
  },
  {
    id: "a-short-term-job-you-want-to-have-in-a-foreign-country",
    retired: true,
    topic: "a short-term job you want to have in a foreign country",
    p2Prompt: cueCard("Describe a short-term job you want to have in a foreign country", [
      "Where it is",
      "How you know of it",
      "What the job is",
      "And explain why you want to do it"
    ]),
    p3Questions: [
      "What short-term jobs do young people do in other countries?",
      "What challenges do young people face when working abroad?",
      "What are the benefits of working for an international company?",
      "What personal skills are required to work in an international company?",
      "What kind of work can young people do in foreign countries?",
      "Why are some people unwilling to work in other countries?"
    ]
  },
  {
    id: "a-time-when-you-gave-advice-to-others",
    retired: true,
    topic: "a time when you gave advice to others",
    p2Prompt: cueCard("Describe a time when you gave advice to others", [
      "When it was",
      "To whom you gave the advice",
      "What the advice was",
      "And explain why you gave the advice"
    ]),
    p3Questions: [
      "Should people prepare before giving advice?",
      "Is it good to ask advice from strangers online?",
      "What are the personalities of people whose job is to give advice to others?",
      "What are the problems if you ask too many people for advice?",
      "Why do some people think it is better to ask for advice from friends than from parents?",
      "When would old people ask young people for advice?"
    ]
  },
  {
    id: "a-person-who-often-helps-others",
    retired: true,
    topic: "a person who often helps others",
    p2Prompt: cueCard("Describe a person who often helps others", [
      "Who this person is",
      "How often he/she helps others",
      "How/why he/she helps others",
      "And how you feel about this person"
    ]),
    p3Questions: [
      "What can children do to help their parents?",
      "Should children help their parents with household chores?",
      "What kind of help do people need when looking for a new job?",
      "Who should people ask for help, colleagues or family members?",
      "Do you think schools should teach children to do household chores?",
      "Why are employees reluctant to ask their managers for help?"
    ]
  },
  {
    id: "an-event-you-attended-in-which-you-didn-t-enjoy-the-musi",
    retired: true,
    topic: "an event you attended in which you didn't enjoy the music played",
    p2Prompt: cueCard("Describe an event you attended in which you didn't enjoy the music played", [
      "What it was",
      "Who you went with",
      "Why you decided to go there",
      "And explain why you didn't enjoy it"
    ]),
    p3Questions: [
      "What kind of music events do people like today?",
      "Do you think children should receive some musical education?",
      "What are the differences between old and young people's music preferences?",
      "What kind of music events are there in your country?",
      "Why do many people like listening to music while doing sports?",
      "What are the differences between listening to music at home and at a live concert?"
    ]
  },
  {
    id: "one-of-your-friends-who-learned-something-without-a-teac",
    retired: true,
    topic: "one of your friends who learned something without a teacher",
    p2Prompt: cueCard("Describe one of your friends who learned something without a teacher", [
      "Who he/she is",
      "What he/she learned",
      "Why he/she learned this",
      "And explain whether it would be easier to learn from a teacher"
    ]),
    p3Questions: [
      "Is it necessary to keep learning after graduating from school?",
      "Should teachers make learning in their classes fun?",
      "Do you think there are too many subjects for students to learn?",
      "Is it better to focus on a few subjects or to learn many subjects?",
      "Do you think enterprises should provide training for their employees?",
      "Do you think it is good for older adults to continue learning?"
    ]
  },
  {
    id: "a-piece-of-technology-that-you-would-like-to-own",
    retired: true,
    topic: "a piece of technology that you would like to own",
    p2Prompt: cueCard("Describe a piece of technology that you would like to own", [
      "What it is",
      "How much it costs",
      "What you will use it for",
      "And explain why you would like to own it"
    ]),
    p3Questions: [
      "What are the differences between the technology of the past and that of today?",
      "What technology do young people like to use?",
      "What are the differences between online and face-to-face communication?",
      "Do you think technology has changed the way people communicate?",
      "What negative effects does technology have on people's relationships?",
      "What are the differences between making friends in real life and online?"
    ]
  },
  {
    id: "a-perfect-job-you-would-like-to-have-in-the-future",
    retired: true,
    topic: "a perfect job you would like to have in the future",
    p2Prompt: cueCard("Describe a perfect job you would like to have in the future", [
      "What it is",
      "Where you heard about it from",
      "What you need to learn to get the job",
      "And explain why you think it is your perfect job"
    ]),
    p3Questions: [
      "What kind of job can be called a 'dream job'?",
      "What jobs do children want to do when they grow up?",
      "Do people's ideal jobs change as they grow up?",
      "What should people consider when choosing jobs?",
      "Is salary the main reason people choose a certain job?",
      "What kind of jobs are the most popular in your country?"
    ]
  },
  {
    id: "a-child-you-know-who-likes-drawing-very-much",
    retired: true,
    topic: "a child you know who likes drawing very much",
    p2Prompt: cueCard("Describe a child you know who likes drawing very much", [
      "How you knew him/her",
      "What he/she is like",
      "How often he/she draws",
      "And explain why you think he/she likes drawing"
    ]),
    p3Questions: [
      "What is the right age for a child to learn drawing?",
      "Why do most children draw more often than adults do?",
      "Why do some people visit galleries or museums instead of viewing artworks online?",
      "Do you think galleries and museums should be free of charge?",
      "How do artworks inspire people?",
      "What are the differences between reading a book and visiting a museum?"
    ]
  },
  {
    id: "a-program-or-app-on-your-computer-or-phone",
    retired: true,
    topic: "a program or app on your computer or phone",
    p2Prompt: cueCard("Describe a program or app on your computer or phone", [
      "What it is",
      "How often you use it",
      "When/how you use it",
      "When/how you found it",
      "And explain how you feel about it"
    ]),
    p3Questions: [
      "What are the differences between old and young people when using apps?",
      "Why do some people not like using apps?",
      "What apps are popular in your country? Why?",
      "Should parents limit their children’s use of computer programs and computer games? Why and how?",
      "Do you think young people are more and more reliant on these programs?",
      "What do you think about some countries banning children from using social media?"
    ]
  },
  {
    id: "a-person-who-makes-plans-a-lot-and-is-good-at-planning",
    retired: true,
    topic: "a person who makes plans a lot and is good at planning",
    p2Prompt: cueCard("Describe a person who makes plans a lot and is good at planning", [
      "Who he/she is",
      "How you knew him/her",
      "What plans he/she makes",
      "And explain how you feel about this person"
    ]),
    p3Questions: [
      "Do you think it's important to plan ahead?",
      "What activities do we need to plan ahead?",
      "Do you think children should plan their future careers?",
      "Should children ask their teachers or parents for advice when making plans?",
      "Is making study plans popular among young people?",
      "Do you think choosing a college major is closely related to a future career?"
    ]
  },
  {
    id: "a-shop-store-you-enjoy-visiting",
    retired: true,
    topic: "a shop/store you enjoy visiting",
    p2Prompt: cueCard("Describe a shop/store you enjoy visiting", [
      "What the shop's name is",
      "Where it is",
      "How often you visit it",
      "And explain why you like to visit it"
    ]),
    p3Questions: [
      "Do people in your country go to the shopping mall frequently?",
      "How have people's shopping habits changed in recent decades?",
      "Do you think shops and shopping malls will disappear in the future?",
      "What are the differences between shopping in street markets and big shopping malls?",
      "What are the differences in the shopping habits of different age groups?",
      "What are the differences between shopping online and in-store?"
    ]
  },
  {
    id: "a-famous-person-you-would-like-to-meet",
    retired: true,
    topic: "a famous person you would like to meet",
    p2Prompt: cueCard("Describe a famous person you would like to meet", [
      "Who he/she is",
      "How you knew him/her",
      "How/where you would like to meet him/her",
      "And explain why you would like to meet him/her"
    ]),
    p3Questions: [
      "What are the advantages and disadvantages of being a famous child?",
      "What can today's children do to become famous?",
      "What can children do with their fame?",
      "Do people become famous because of their talent?",
      "Is it easy to become famous in your country?",
      "Do you want to be a famous person?"
    ]
  },
  {
    id: "an-interesting-building",
    retired: true,
    topic: "an interesting building",
    p2Prompt: cueCard("Describe an interesting building", [
      "Where it is",
      "What it looks like",
      "What function it has",
      "And explain why you think it is interesting"
    ]),
    p3Questions: [
      "What types of buildings are popular in your country?",
      "Is it worth spending a lot of money on the exterior appearance of a building?",
      "Is it more important for a building to look good on the outside or on the inside?",
      "Why do people like to visit historical sites?",
      "Do you think it's reasonable to charge an entry fee for visiting interesting buildings?",
      "Is it better to live in a new building or an old one?"
    ]
  },
  {
    id: "a-movie-you-watched-and-enjoyed-recently",
    retired: true,
    topic: "a movie you watched and enjoyed recently",
    p2Prompt: cueCard("Describe a movie you watched and enjoyed recently", [
      "When and where you watched it",
      "Who you watched it with",
      "What it was about",
      "And explain why you watched this movie"
    ]),
    p3Questions: [
      "What kinds of movies do you think are successful in your country?",
      "What are the factors that make a successful movie?",
      "Do Chinese people prefer to watch domestic movies or foreign movies?",
      "Do you think only well-known directors can create the best movies?",
      "Do you think successful movies should have well-known actors or actresses in leading roles?",
      "Why do people prefer to watch movies in the cinema?"
    ]
  },
  {
    id: "a-tv-or-online-program-you-like-to-watch",
    retired: true,
    topic: "a TV or online program you like to watch",
    p2Prompt: cueCard("Describe a TV or online program you like to watch", [
      "What it is",
      "What it is about",
      "Who you watch it with",
      "And explain why you like to watch it"
    ]),
    p3Questions: [
      "What programs do people like to watch in your country?",
      "Do people in your country like to watch foreign TV programs?",
      "What's the benefit of letting kids watch animal videos than visiting zoos?",
      "Do teachers play videos in class in your country?",
      "Do you think watching talk shows is a waste of time?",
      "Do you think we can acquire knowledge from watching TV programs?"
    ]
  },
  {
    id: "a-quiet-place-you-like-to-go",
    retired: true,
    topic: "a quiet place you like to go",
    p2Prompt: cueCard("Describe a quiet place you like to go", [
      "Where it is",
      "How you knew it",
      "How often you go there",
      "What you do there",
      "And explain how you feel about the place"
    ]),
    p3Questions: [
      "Is it easy to find quiet places in your country? Why?",
      "How do people spend their leisure time in your country?",
      "How does technology affect the way people spend their leisure time?",
      "Do you think only old people have time for leisure?",
      "Why do old people prefer to live in quiet places?",
      "Why are there more noises made at home now than in the past?"
    ]
  },
  {
    id: "an-item-on-which-you-spent-more-than-expected",
    retired: true,
    topic: "an item on which you spent more than expected",
    p2Prompt: cueCard("Describe an item on which you spent more than expected", [
      "What it is",
      "How much you spent on it",
      "Why you bought it",
      "And explain why you think you spent more than expected"
    ]),
    p3Questions: [
      "Do you often buy more than you expected?",
      "What do you think young people spend most of their money on?",
      "Do you think it is important to save money? Why?",
      "Do people buy things they don’t need?",
      "Do you think it is the rich people's responsibility to donate money to people in need?",
      "What kind of things are people happy to pay a high price for?"
    ]
  },
  {
    id: "a-time-when-you-felt-proud-of-a-family-member",
    retired: true,
    topic: "a time when you felt proud of a family member",
    p2Prompt: cueCard("Describe a time when you felt proud of a family member", [
      "When it happened",
      "Who the person is",
      "What the person did",
      "And explain why you felt proud of him/her"
    ]),
    p3Questions: [
      "When would parents feel proud of their children?",
      "Should parents reward children? Why and how?",
      "Is it good to reward children too often? Why?",
      "Do rewards help a child become better?",
      "What do you think about children working hard just for grades?"
    ]
  },
  {
    id: "a-bicycle-motorcycle-car-trip-you-would-like-to-go",
    retired: true,
    topic: "a bicycle/motorcycle/car trip you would like to go",
    p2Prompt: cueCard("Describe a bicycle/motorcycle/car trip you would like to go", [
      "Who you would like to go with",
      "Where you would like to go",
      "When you would like to go",
      "And explain why you would like to go by bicycle/motorcycle/car"
    ]),
    p3Questions: [
      "Which form of vehicle is more popular in your country, bikes, cars or motorcycles?",
      "Do you think air pollution comes mostly from mobile vehicles?",
      "Do you think people need to change the way of transportation drastically to protect the environment?",
      "How are the transportation systems in urban areas and rural areas different?",
      "Why do more people own and drive private vehicles now?",
      "What do you think of the future of electric cars?"
    ]
  },
  {
    id: "a-person-who-solved-a-problem-in-a-smart-way",
    retired: true,
    topic: "a person who solved a problem in a smart way",
    p2Prompt: cueCard("Describe a person who solved a problem in a smart way", [
      "Who this person is",
      "What the problem was",
      "How he/she solved it",
      "And explain why you think he/she did it in a smart way"
    ]),
    p3Questions: [
      "Do you think children are born smart or they learn to become smart?",
      "How do children become smart at school?",
      "Why are some people well-rounded and others only good at one thing?",
      "Why does modern society need talents of all kinds?",
      "Do you think smart children are happier than other children?",
      "Is it important for schools to identify and develop each student's talents?"
    ]
  },
  {
    id: "an-occasion-when-many-people-were-smiling",
    retired: true,
    topic: "an occasion when many people were smiling",
    p2Prompt: cueCard("Describe an occasion when many people were smiling", [
      "When it happened",
      "Who you were with",
      "What happened",
      "And explain why most people were smiling"
    ]),
    p3Questions: [
      "Do you think people who like to smile are more friendly?",
      "Why do most people smile in photographs?",
      "Do women smile more than men? Why?",
      "Do people smile more when they are younger or older?",
      "Is smiling important in your culture?",
      "Are there any occasions when people need to pretend to smile?"
    ]
  },
  {
    id: "an-occasion-when-you-were-not-allowed-to-use-your-mobile",
    retired: true,
    topic: "an occasion when you were not allowed to use your mobile phone",
    p2Prompt: cueCard("Describe an occasion when you were not allowed to use your mobile phone", [
      "When it was",
      "Where it was",
      "Why you were not allowed to use your mobile phone",
      "And how you felt about it"
    ]),
    p3Questions: [
      "How do young and old people use mobile phones differently?",
      "What positive and negative impact do mobile phones have on friendship?",
      "Is it a waste of time to take pictures with mobile phones?",
      "Do you think it is necessary to have laws on the use of mobile phones?",
      "What are examples of good and poor phone manners?",
      "How does the internet benefit people?"
    ]
  },
  {
    id: "a-time-when-you-encouraged-someone-to-do-something-that",
    retired: true,
    topic: "a time when you encouraged someone to do something that he/she didn't want to do",
    p2Prompt: cueCard("Describe a time when you encouraged someone to do something that he/she didn't want to do", [
      "Who he or she is",
      "What you encouraged him/her to do",
      "How he/she reacted",
      "And explain why you encouraged him/her to do it"
    ]),
    p3Questions: [
      "How can leaders encourage their employees?",
      "When should parents encourage their children?",
      "What kind of encouragement should parents give?",
      "Do you think some people are better than others at persuading?",
      "Should children do everything their parents ask them to do?",
      "How can employers encourage their staff?"
    ]
  },
  {
    id: "something-important-that-has-been-kept-in-your-family-fo",
    retired: true,
    topic: "something important that has been kept in your family for a long time",
    p2Prompt: cueCard("Describe something important that has been kept in your family for a long time", [
      "What it is",
      "When your family had it",
      "How your family got it",
      "And explain why it is important to your family"
    ]),
    p3Questions: [
      "What things do families keep for a long time?",
      "What's the difference between things valued by people in the past and today?",
      "What kinds of things are kept in museums?",
      "What's the influence of technology on museums?",
      "What are the benefits of technology for learning history?",
      "Why do people visit museums?"
    ]
  },
  {
    id: "a-time-you-needed-to-use-your-imagination",
    retired: true,
    topic: "a time you needed to use your imagination",
    p2Prompt: cueCard("Describe a time you needed to use your imagination", [
      "When it was",
      "Why you needed to use imagination",
      "How difficult or easy it was",
      "And explain how you felt about it"
    ]),
    p3Questions: [
      "Do you think adults can have lots of imagination?",
      "Do you think imagination is essential for scientists?",
      "What kinds of jobs need imagination?",
      "What subjects are helpful for children's imagination?",
      "What games help develop children's imagination?",
      "How important is imagination to children?"
    ]
  },
  {
    id: "a-place-where-you-enjoy-shopping",
    retired: true,
    topic: "a place where you enjoy shopping",
    p2Prompt: cueCard("Describe a place where you enjoy shopping", [
      "What its name is",
      "Where it is",
      "How often you visit it",
      "And what you usually buy there"
    ]),
    p3Questions: [
      "Why do people buy things they don't need?",
      "Do you think it's a waste of time to go shopping?",
      "Why are some people keen on shopping?",
      "What kind of people like shopping?",
      "Where do people like to shop in your country?"
    ]
  },
  {
    id: "a-city-that-you-have-been-to-and-would-like-to-visit-aga",
    retired: true,
    topic: "a city that you have been to and would like to visit again",
    p2Prompt: cueCard("Describe a city that you have been to and would like to visit again", [
      "When you visited it",
      "What you did there",
      "What it was like",
      "And explain why you would like to visit it again"
    ]),
    p3Questions: [
      "What's the difference between the city and the countryside?",
      "Some people say large cities are suitable for old people. What do you think?",
      "Do you think it is possible that all of the population move to cities?",
      "Do you think people in the countryside are friendlier than people in the city?",
      "Are there any changes in your city?",
      "What should the government do to improve citizens's safety?"
    ]
  }
];

export const currentP1Bank = p1QuestionBank.filter((set) => !set.retired);
export const currentP2P3Bank = p2P3QuestionBank.filter((set) => !set.retired);
