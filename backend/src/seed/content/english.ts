import { type CourseSpec, fill, flash, match, mc, order, short, tf } from '../builders';

export const englishGrammar: CourseSpec = {
  slug: 'english-grammar-vocabulary',
  title: 'English Grammar & Vocabulary',
  category: 'english_grammar',
  description:
    'Build accurate everyday English: articles, tenses, prepositions and the vocabulary you need at college and work. Short, practical lessons with instant feedback.',
  level: 'beginner',
  estimatedHours: 6,
  objectives: [
    'Use a / an / the correctly',
    'Choose between present simple and present continuous',
    'Use common irregular past-tense verbs',
    'Pick the right preposition of time',
    'Avoid the most common confusable words',
  ],
  color: '#FF7A45',
  icon: 'book-open',
  tracks: ['english'],
  units: [
    {
      slug: 'foundations',
      title: 'Everyday Foundations',
      description: 'Articles, present tenses and workplace vocabulary.',
      lessons: [
        {
          slug: 'articles',
          title: 'A, An or The?',
          summary: 'Use "a" and "an" for one non-specific thing, and "the" for something specific.',
          topic: 'Articles',
          questions: [
            mc('I saw ___ elephant at the zoo.', ['a', 'an', 'the', 'no article'], 1, '"Elephant" begins with a vowel sound, so we use "an".'),
            mc('She is ___ university student.', ['a', 'an', 'the', 'no article'], 0, '"University" starts with a "yoo" (consonant) sound, so it takes "a" — the sound matters, not the letter.'),
            fill('Can you close ___ door, please? (the one in this room)', ['the'], 'We both know which door, so it is specific: "the".', ['a', 'an', 'the']),
            tf('"He waited for an hour." is correct.', true, 'The "h" in "hour" is silent, so the word starts with a vowel sound: "an hour".'),
            mc('Which sentence is correct?', ['I want to be a engineer.', 'I want to be an engineer.', 'I want to be the engineer.', 'I want to be engineer.'], 1, 'Jobs take an article in English. "Engineer" starts with a vowel sound → "an engineer".'),
          ],
        },
        {
          slug: 'present-tenses',
          title: 'Present Simple vs Continuous',
          summary: 'Present simple for habits and facts; present continuous for actions happening now or temporary situations.',
          topic: 'Present tenses',
          questions: [
            mc('Water ___ at 100°C.', ['boils', 'is boiling', 'boil', 'boiling'], 0, 'Scientific facts use the present simple: "Water boils at 100°C."'),
            mc('Look! It ___.', ['rains', 'is raining', 'rain', 'raining'], 1, '"Look!" shows the action is happening now → present continuous.'),
            fill('My brother ___ (work) in Pune.', ['works'], 'A permanent situation uses present simple. With he/she/it add -s: "works".'),
            order('Arrange the sentence', ['I', 'am', 'learning', 'Python', 'this', 'month'], 'A temporary activity around now uses "am/is/are + -ing".', ['learn']),
            tf('"I am knowing the answer." is correct English.', false, '"Know" is a state verb and is normally not used in continuous form: "I know the answer."'),
          ],
        },
        {
          slug: 'workplace-vocabulary',
          title: 'Workplace Vocabulary',
          summary: 'Core words you will hear in offices, internships and meetings.',
          topic: 'Workplace vocabulary',
          questions: [
            match('Match each word with its meaning', [
              ['deadline', 'the latest time to finish something'],
              ['colleague', 'a person you work with'],
              ['agenda', 'a list of topics for a meeting'],
              ['feedback', 'comments on how well you did'],
            ], 'These words appear daily at work. Try using each in a sentence today.'),
            flash('What does "follow up" mean?', 'To contact someone again about something you discussed earlier.', 'Example: "I\'ll follow up with you by email tomorrow."'),
            mc('"Can we ___ the meeting to Friday?" (move it to a later date)', ['postpone', 'prepone', 'cancel', 'attend'], 0, '"Postpone" means move to a later time. "Prepone" is common in Indian English but not understood internationally — prefer "bring forward" for earlier.'),
            fill('Please ___ the document before you send it. (check carefully for errors)', ['proofread', 'proof-read', 'proof read'], 'To proofread is to read carefully to find and fix mistakes.', ['proofread', 'overlook', 'neglect']),
          ],
        },
        {
          slug: 'foundations-checkpoint',
          title: 'Checkpoint: Foundations',
          summary: 'Score 70% or more to unlock the next unit.',
          topic: 'Foundations review',
          kind: 'checkpoint',
          xpReward: 25,
          questions: [
            mc('He bought ___ umbrella because it was raining.', ['a', 'an', 'the', 'no article'], 1, '"Umbrella" starts with a vowel sound → "an".', 1),
            mc('I usually ___ to college by bus.', ['go', 'am going', 'goes', 'going'], 0, '"Usually" signals a habit → present simple. With "I" there is no -s.'),
            tf('"She is having two brothers." is the natural way to say this.', false, 'For possession, "have" is a state verb: "She has two brothers."'),
            mc('Which word means "a person you work with"?', ['client', 'colleague', 'customer', 'candidate'], 1, 'A colleague is a co-worker.'),
            fill('We ___ (discuss) the budget right now, can I call you back?', ['are discussing', "'re discussing"], 'Happening right now → present continuous: "are discussing".'),
          ],
        },
      ],
    },
    {
      slug: 'building-sentences',
      title: 'Building Sentences',
      description: 'Past simple, prepositions of time and commonly confused words.',
      lessons: [
        {
          slug: 'past-simple',
          title: 'Past Simple & Irregular Verbs',
          summary: 'Finished actions in the past. Many common verbs are irregular.',
          topic: 'Past simple',
          questions: [
            match('Match the verb with its past simple form', [
              ['go', 'went'],
              ['write', 'wrote'],
              ['buy', 'bought'],
              ['teach', 'taught'],
            ], 'These irregular forms must be memorised — practise them with flashcards.'),
            mc('Yesterday I ___ my assignment.', ['finish', 'finished', 'have finish', 'finishing'], 1, '"Yesterday" is a finished time → past simple "finished".'),
            mc('Did you ___ the email?', ['sent', 'send', 'sending', 'sends'], 1, 'After "did" the main verb goes back to its base form: "Did you send…?"'),
            fill('Last week we ___ (meet) the new manager.', ['met'], '"Meet" is irregular: meet → met.'),
          ],
        },
        {
          slug: 'prepositions-time',
          title: 'In, On, At (Time)',
          summary: 'AT for clock times, ON for days and dates, IN for months, years and longer periods.',
          topic: 'Prepositions of time',
          questions: [
            mc('The interview is ___ Monday.', ['in', 'on', 'at', 'by'], 1, 'Days take "on": on Monday.'),
            mc('The class starts ___ 9:30.', ['in', 'on', 'at', 'for'], 2, 'Clock times take "at".'),
            mc('I graduated ___ 2025.', ['in', 'on', 'at', 'since'], 0, 'Years take "in".'),
            fill('My birthday is ___ 14 August.', ['on'], 'Specific dates take "on".', ['in', 'on', 'at']),
            tf('"See you at the weekend" is common in British English, while Americans usually say "on the weekend".', true, 'Both are correct; it is a regional difference.'),
          ],
        },
        {
          slug: 'confusables',
          title: 'Commonly Confused Words',
          summary: 'its/it\'s, affect/effect, their/there/they\'re and more.',
          topic: 'Confusable words',
          questions: [
            mc('The company changed ___ logo.', ["it's", 'its', 'its\'', 'it is'], 1, '"Its" (no apostrophe) shows possession. "It\'s" means "it is".'),
            mc('Lack of sleep can ___ your concentration.', ['effect', 'affect', 'effort', 'infect'], 1, '"Affect" is usually the verb; "effect" is usually the noun ("a big effect").'),
            fill("___ going to present first? (they are)", ["They're", 'they are'], '"They\'re" is the short form of "they are".', ["Their", "There", "They're"]),
            short('Write one sentence using the noun "effect" correctly.', { keywords: ['effect'] }, 'Example: "The new policy had a positive effect on productivity."', 'e.g. The training had a big effect…'),
          ],
        },
        {
          slug: 'building-checkpoint',
          title: 'Checkpoint: Building Sentences',
          summary: 'Score 70% or more to complete the unit.',
          topic: 'Building sentences review',
          kind: 'checkpoint',
          xpReward: 25,
          questions: [
            mc('She ___ to Mumbai last month.', ['go', 'goes', 'went', 'gone'], 2, '"Last month" → past simple of "go" = "went".'),
            mc('The webinar is ___ the evening.', ['in', 'on', 'at', 'by'], 0, 'Parts of the day take "in": in the evening (but "at night").'),
            mc('___ a good idea to back up your files.', ['Its', "It's", 'Its\'', 'It'], 1, '"It is a good idea" → "It\'s".'),
            order('Arrange the sentence', ['We', 'met', 'the', 'client', 'on', 'Tuesday'], 'Past simple + "on" for days.', ['at']),
            tf('"The new rules will effect everyone." is correct.', false, 'Here we need the verb "affect": "The new rules will affect everyone."'),
          ],
        },
      ],
    },
  ],
};

export const englishCommunication: CourseSpec = {
  slug: 'workplace-communication',
  title: 'Workplace English & Communication',
  category: 'english_communication',
  description:
    'Speak and write confidently at work: introductions, polite requests, emails and small talk. Pair each lesson with AI role-play practice in the Training Academy.',
  level: 'beginner',
  estimatedHours: 4,
  objectives: [
    'Introduce yourself clearly in 30 seconds',
    'Make polite requests and disagree respectfully',
    'Write short, professional emails',
  ],
  color: '#12B886',
  icon: 'message-circle',
  tracks: ['english', 'interview'],
  units: [
    {
      slug: 'professional-conversations',
      title: 'Professional Conversations',
      description: 'The phrases that make you sound confident and polite.',
      lessons: [
        {
          slug: 'self-introduction',
          title: 'Introducing Yourself',
          summary: 'Name → current role/studies → one highlight → what you want next.',
          topic: 'Self-introduction',
          questions: [
            order('Build a professional opening line', ['Hi,', "I'm", 'Priya,', 'a', 'final-year', 'computer', 'engineering', 'student'], 'Start with a greeting, your name, and your current role.', ['am']),
            mc('Which is the best way to end a short self-introduction at a networking event?', [
              "That's all about me.",
              "I'm looking to learn more about backend roles — what does your team work on?",
              'Any questions?',
              'Please give me a job.',
            ], 1, 'End with a clear goal and a question that keeps the conversation going.'),
            tf('In a professional introduction you should list every project you have ever done.', false, 'Pick one highlight that is relevant to the listener. Brevity shows confidence.'),
            short('Write your own one-sentence introduction including your name and what you study or do.', { keywords: ["i'm", 'i am'], minKeywords: 1 }, 'A strong pattern: "Hi, I\'m [name], a [role/year] [field] who enjoys [interest]."', "Hi, I'm…"),
          ],
        },
        {
          slug: 'polite-requests',
          title: 'Polite Requests & Disagreeing',
          summary: 'Soften requests with "Could you…?" and disagree with "I see your point, but…".',
          topic: 'Polite requests',
          questions: [
            mc('Which request is most polite for asking a senior colleague?', ['Send me the file.', 'I want the file now.', 'Could you please share the file when you get a chance?', 'File please.'], 2, '"Could you please…when you get a chance?" is polite and respectful of their time.'),
            match('Match the blunt phrase with a polite alternative', [
              ["You're wrong.", "I see it a bit differently."],
              ['I need this today.', 'Would it be possible to have this by end of day?'],
              ["I don't understand.", 'Could you clarify what you mean by…?'],
            ], 'Polite phrasing keeps the focus on the work, not the person.'),
            fill("I see your point, ___ I think we should test it first.", ['but'], 'Acknowledge, then add your view with "but".', ['but', 'so', 'because']),
            tf('"Kindly do the needful" is clear and widely understood in international emails.', false, 'It is common in Indian English but sounds unclear to many international readers. Say exactly what you need instead.'),
          ],
        },
        {
          slug: 'email-etiquette',
          title: 'Writing Professional Emails',
          summary: 'Clear subject, short greeting, purpose first, specific ask, polite close.',
          topic: 'Email writing',
          questions: [
            mc('Which subject line is best?', ['Hi', 'Urgent!!!', 'Request: Access to staging server for API testing', 'Regarding the thing we discussed'], 2, 'A good subject line says the purpose and the topic.'),
            order('Order the parts of a professional email', ['Greeting', 'Purpose', 'Details', 'Request', 'Closing'], 'Lead with why you are writing, then details and a clear ask.'),
            mc('Which closing is appropriate in a formal email?', ['Cya', 'Best regards,', 'Love,', 'Thx bye'], 1, '"Best regards" or "Kind regards" are safe professional closings.'),
            flash('What does "CC" mean in an email?', 'Carbon copy — people who should be informed but are not expected to act.', 'Use "To" for people who must act and "CC" for those who just need to know.'),
          ],
        },
        {
          slug: 'communication-checkpoint',
          title: 'Checkpoint: Conversations',
          summary: 'Score 70% or more to complete the unit.',
          topic: 'Communication review',
          kind: 'checkpoint',
          xpReward: 25,
          questions: [
            mc('What should come first in a work email?', ['Your life story', 'The purpose of the email', 'A joke', 'Your signature'], 1, 'Busy readers want to know why you are writing straight away.'),
            mc('Choose the most polite disagreement.', ["That's a bad idea.", 'No.', "That's a good point — have we considered the cost, though?", 'Whatever you say.'], 2, 'Acknowledge, then raise your concern as a question.'),
            tf('Ending a self-introduction with a question helps continue the conversation.', true, 'Questions show interest and invite the other person to speak.'),
            fill('___ you please review my pull request?', ['Could', 'Would', 'Can'], '"Could you please…" is a polite request form.', ['Could', 'Must', 'Should']),
          ],
        },
      ],
    },
  ],
};
