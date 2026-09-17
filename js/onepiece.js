/**
 * One Piece, dentro l'app.
 *
 * Il manga di Eiichirō Oda è sotto copyright di Shūeisha: il suo testo non
 * esiste in nessuna fonte libera, e questo file non ne contiene nemmeno una
 * riga. Contiene due cose diverse:
 *
 *   - i **dati** dei 115 volumi — numero, titolo italiano, titolo giapponese,
 *     romaji, capitoli contenuti — presi dall'elenco di it.wikipedia, che a
 *     sua volta cita i volumi della Shūeisha e dell'edizione italiana Star
 *     Comics;
 *   - la **trama**, scritta qui, arco per arco, in italiano, inglese,
 *     giapponese, francese, spagnolo e tedesco. Raccontare di che cosa parla
 *     una storia non è riprodurla.
 *
 * La suddivisione in venti archi è quella indicata dal sito ufficiale della
 * serie, con gli intervalli di volumi e capitoli che ne derivano. I volumi a
 * cavallo fra due archi sono assegnati a quello in cui sta la maggior parte
 * dei loro capitoli.
 *
 * Perché arco e non volume: un volume è una fetta di carta, decisa da quante
 * pagine entrano in un tankōbon. Un arco è una storia con un inizio e una
 * fine. Chi chiede «di che cosa parla il volume 37» vuole sapere che cosa
 * succede a Water Seven, non i tre capitoli che avanzano.
 */
const OnePiece = (() => {
  "use strict";

  /** Le lingue in cui la trama è scritta. */
  const LINGUE = [
    { code: "it", label: "Italiano" },
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
    { code: "fr", label: "Français" },
    { code: "es", label: "Español" },
    { code: "de", label: "Deutsch" }
  ];

  /** Di che cosa parla One Piece, in due paragrafi. */
  const STORIA = {
    it: "Gol D. Roger, il Re dei pirati, prima di essere giustiziato rivela che il suo tesoro — lo One Piece — è nascosto da qualche parte in mare. Comincia così l'era della grande pirateria. Vent'anni dopo Monkey D. Rufy, un ragazzo che ha mangiato un frutto del diavolo e ha il corpo di gomma, parte da un villaggio dell'East Blue con un cappello di paglia in testa e un solo obiettivo: trovare lo One Piece e diventare il Re dei pirati.\n\nNon lo fa da solo. Lungo la Rotta Maggiore raccoglie una ciurma dove ognuno ha un sogno suo: uno spadaccino che vuole essere il più forte del mondo, una navigatrice che vuole disegnare la mappa di tutti i mari, un cuoco che cerca un mare leggendario, un tiratore che vuole diventare un guerriero coraggioso, un medico, un'archeologa, un carpentiere, un musicista, un timoniere. È una storia di avventura e di isole, ma quello di cui parla davvero è la libertà: chi la prende, chi la nega, e quanto costa.",
    en: "Before his execution, Gol D. Roger — the King of the Pirates — reveals that his treasure, the One Piece, lies hidden somewhere at sea. The great age of piracy begins. Twenty years later Monkey D. Luffy, a boy who ate a Devil Fruit and whose body is made of rubber, leaves a village in the East Blue wearing a straw hat, with one goal: find the One Piece and become King of the Pirates.\n\nHe does not go alone. Along the Grand Line he gathers a crew in which everyone carries their own dream: a swordsman who wants to be the world's strongest, a navigator who wants to chart every sea, a cook searching for a legendary ocean, a sniper who wants to become a brave warrior, a doctor, an archaeologist, a shipwright, a musician, a helmsman. It is a story of adventure and islands, but what it is really about is freedom: who takes it, who denies it, and what it costs.",
    ja: "海賊王ゴール・D・ロジャーは処刑の直前、自らの財宝「ひとつなぎの大秘宝（ワンピース）」が海のどこかにあると明かした。こうして大海賊時代が始まる。二十年後、悪魔の実を食べてゴム人間となった少年モンキー・D・ルフィは、麦わら帽子をかぶり、東の海（イーストブルー）の村を出る。目的はただ一つ、ワンピースを見つけて海賊王になることだ。\n\nルフィは一人では行かない。偉大なる航路（グランドライン）で、それぞれの夢を持つ仲間を集めていく。世界一の剣豪を目指す剣士、すべての海の海図を描きたい航海士、伝説の海を探す料理人、勇敢な海の戦士になりたい狙撃手、船医、考古学者、船大工、音楽家、操舵手。冒険と島々の物語でありながら、本当に描かれているのは自由だ。誰がそれを手にし、誰がそれを奪い、その代償は何かということ。",
    fr: "Avant son exécution, Gol D. Roger — le Roi des pirates — révèle que son trésor, le One Piece, est caché quelque part en mer. L'âge d'or de la piraterie commence. Vingt ans plus tard, Monkey D. Luffy, un garçon qui a mangé un fruit du démon et dont le corps est en caoutchouc, quitte un village d'East Blue avec un chapeau de paille sur la tête et un seul but : trouver le One Piece et devenir le Roi des pirates.\n\nIl n'y va pas seul. Le long de Grand Line, il rassemble un équipage où chacun porte son propre rêve : un épéiste qui veut être le plus fort du monde, une navigatrice qui veut dessiner la carte de toutes les mers, un cuisinier à la recherche d'un océan légendaire, un tireur d'élite qui veut devenir un brave guerrier, un médecin, une archéologue, un charpentier, un musicien, un timonier. C'est une histoire d'aventure et d'îles, mais ce dont elle parle vraiment, c'est la liberté : qui la prend, qui la refuse, et ce qu'elle coûte.",
    es: "Antes de ser ejecutado, Gol D. Roger — el Rey de los Piratas — revela que su tesoro, el One Piece, está escondido en algún lugar del mar. Así comienza la gran era de la piratería. Veinte años después, Monkey D. Luffy, un chico que comió una fruta del diablo y tiene el cuerpo de goma, deja un pueblo del East Blue con un sombrero de paja y un único objetivo: encontrar el One Piece y convertirse en el Rey de los Piratas.\n\nNo va solo. A lo largo del Grand Line reúne una tripulación en la que cada uno lleva su propio sueño: un espadachín que quiere ser el más fuerte del mundo, una navegante que quiere dibujar el mapa de todos los mares, un cocinero que busca un océano legendario, un tirador que quiere ser un valiente guerrero, un médico, una arqueóloga, un carpintero, un músico, un timonel. Es una historia de aventuras e islas, pero de lo que habla en realidad es de la libertad: quién la toma, quién la niega y cuánto cuesta.",
    de: "Kurz vor seiner Hinrichtung verrät Gol D. Roger — der König der Piraten —, dass sein Schatz, das One Piece, irgendwo auf dem Meer verborgen liegt. So beginnt das große Piratenzeitalter. Zwanzig Jahre später verlässt Monkey D. Ruffy, ein Junge, der eine Teufelsfrucht gegessen hat und dessen Körper aus Gummi besteht, ein Dorf im East Blue — mit einem Strohhut auf dem Kopf und einem einzigen Ziel: das One Piece zu finden und König der Piraten zu werden.\n\nEr geht nicht allein. Auf der Grand Line sammelt er eine Crew, in der jeder seinen eigenen Traum trägt: ein Schwertkämpfer, der der Stärkste der Welt werden will, eine Navigatorin, die alle Meere kartieren will, ein Koch auf der Suche nach einem legendären Ozean, ein Schütze, der ein tapferer Krieger werden will, ein Arzt, eine Archäologin, ein Schiffszimmermann, ein Musiker, ein Steuermann. Es ist eine Geschichte von Abenteuern und Inseln — aber worum es wirklich geht, ist Freiheit: wer sie sich nimmt, wer sie verweigert, und was sie kostet."
  };

  /**
   * I venti archi, nell'ordine in cui si leggono.
   *
   * `vol` e `cap` sono gli intervalli ufficiali; l'ultimo arco è in corso e
   * la sua fine non si sa. `nome` e `trama` hanno una voce per lingua.
   */
  const ARCHI = [
    {
      key: "east-blue", vol: [1, 12], cap: [1, 100],
      nome: { it: "Mare Orientale", en: "East Blue", ja: "イーストブルー編",
              fr: "East Blue", es: "East Blue", de: "East Blue" },
      trama: {
        it: "Rufy lascia il suo villaggio su una barchetta e comincia a cercare una ciurma. Trova Zoro, spadaccino legato a un palo in un cortile della Marina; Nami, una ladra che deruba i pirati; Usopp, un bugiardo che sogna il mare; Sanji, cuoco di un ristorante galleggiante. Uno dopo l'altro sconfiggono il pagliaccio Bagy, il maggiordomo Kuro, il pirata Krieg e infine l'uomo-pesce Arlong, che teneva il villaggio di Nami sotto riscatto da otto anni. L'arco si chiude a Logue Town, la città dove Roger è nato ed è stato giustiziato: da lì si entra nella Rotta Maggiore.",
        en: "Luffy leaves his village in a rowing boat and starts looking for a crew. He finds Zoro, a swordsman tied to a post in a Marine courtyard; Nami, a thief who robs pirates; Usopp, a liar who dreams of the sea; Sanji, cook on a floating restaurant. One after another they beat the clown Buggy, the butler Kuro, the pirate Krieg, and finally the fish-man Arlong, who had held Nami's village to ransom for eight years. The arc closes at Loguetown, the town where Roger was born and executed: from there the Grand Line begins.",
        ja: "ルフィは小舟で故郷の村を出て、仲間を探し始める。海軍基地の中庭で杭に縛られていた剣士ゾロ、海賊専門の泥棒ナミ、海に憧れる嘘つきウソップ、海上レストランのコック・サンジ。一人ずつ仲間になりながら、道化のバギー、執事のクロ、海賊クリーク、そして八年間ナミの村を支配していた魚人アーロンを打ち倒す。物語はロジャーが生まれ処刑された町ローグタウンで一区切りとなり、ここから偉大なる航路が始まる。",
        fr: "Luffy quitte son village sur une barque et se met à chercher un équipage. Il trouve Zoro, un épéiste attaché à un poteau dans une cour de la Marine ; Nami, une voleuse qui dérobe les pirates ; Usopp, un menteur qui rêve de la mer ; Sanji, cuisinier d'un restaurant flottant. L'un après l'autre, ils battent le clown Baggy, le majordome Kuro, le pirate Krieg, et enfin l'homme-poisson Arlong, qui rançonnait le village de Nami depuis huit ans. L'arc se termine à Loguetown, la ville où Roger est né et a été exécuté : c'est là que commence Grand Line.",
        es: "Luffy deja su pueblo en una barca y empieza a buscar tripulación. Encuentra a Zoro, un espadachín atado a un poste en un patio de la Marina; a Nami, una ladrona que roba a los piratas; a Usopp, un mentiroso que sueña con el mar; a Sanji, cocinero de un restaurante flotante. Uno tras otro derrotan al payaso Buggy, al mayordomo Kuro, al pirata Krieg y por fin al gyojin Arlong, que tenía secuestrado el pueblo de Nami desde ocho años atrás. El arco cierra en Loguetown, la ciudad donde Roger nació y fue ejecutado: desde allí se entra en el Grand Line.",
        de: "Ruffy verlässt sein Dorf in einem Ruderboot und beginnt, eine Crew zu suchen. Er findet Zorro, einen Schwertkämpfer, der im Hof eines Marinestützpunkts an einen Pfahl gebunden ist; Nami, eine Diebin, die Piraten bestiehlt; Lysop, einen Lügner, der vom Meer träumt; Sanji, Koch auf einem schwimmenden Restaurant. Einer nach dem anderen besiegen sie den Clown Buggy, den Butler Kuro, den Piraten Krieg und schließlich den Fischmenschen Arlong, der Namis Dorf acht Jahre lang erpresste. Der Handlungsbogen endet in Logue Town, der Stadt, in der Roger geboren und hingerichtet wurde: dort beginnt die Grand Line."
      }
    },
    {
      key: "alabasta", vol: [12, 24], cap: [101, 217],
      nome: { it: "Alabasta", en: "Alabasta", ja: "アラバスタ編",
              fr: "Alabasta", es: "Alabasta", de: "Alabasta" },
      trama: {
        it: "Entrati nella Rotta Maggiore, i Cappelli di paglia scoprono che una società segreta, la Baroque Works, sta preparando un colpo di stato in un regno del deserto. La principessa Vivi viaggia con loro sotto falso nome per fermarlo. Dietro tutto c'è Crocodile, uno dei Sette Corsari, che ha prosciugato il paese di pioggia e fiducia per farlo ribellare contro il suo re. Fra oasi, guerrieri del deserto e un esercito in marcia, la ciurma arriva ad Alubarna poche ore prima che la guerra civile scoppi davvero. Qui Nico Robin, che lavorava per Crocodile, sceglie da che parte stare.",
        en: "Having entered the Grand Line, the Straw Hats find that a secret society, Baroque Works, is preparing a coup in a desert kingdom. Princess Vivi travels with them under a false name to stop it. Behind it all is Crocodile, one of the Seven Warlords, who has drained the country of rain and of trust so it will rise against its king. Among oases, desert warriors and a marching army, the crew reach Alubarna hours before the civil war truly breaks out. Here Nico Robin, who worked for Crocodile, chooses her side.",
        ja: "偉大なる航路に入った麦わらの一味は、秘密結社バロックワークスが砂漠の王国で国家転覆を企てていることを知る。王女ビビは偽名で一味に同行し、それを止めようとする。背後にいるのは七武海の一人クロコダイル。国から雨と信頼を奪い、民を国王に反逆させようとしていた。オアシス、砂漠の戦士、進軍する軍勢のなかを抜けて、一味は内戦が本当に始まる数時間前にアルバーナへたどり着く。そしてクロコダイルの下にいたニコ・ロビンが、自分の立つ側を選ぶ。",
        fr: "Entrés sur Grand Line, les Chapeaux de paille découvrent qu'une société secrète, Baroque Works, prépare un coup d'État dans un royaume du désert. La princesse Vivi voyage avec eux sous un faux nom pour l'empêcher. Derrière tout cela se trouve Crocodile, l'un des Sept Grands Corsaires, qui a privé le pays de pluie et de confiance pour qu'il se soulève contre son roi. Entre oasis, guerriers du désert et armée en marche, l'équipage atteint Alubarna quelques heures avant que la guerre civile n'éclate vraiment. C'est là que Nico Robin, qui travaillait pour Crocodile, choisit son camp.",
        es: "Ya en el Grand Line, los Sombrero de Paja descubren que una sociedad secreta, Baroque Works, prepara un golpe de estado en un reino del desierto. La princesa Vivi viaja con ellos bajo un nombre falso para impedirlo. Detrás de todo está Crocodile, uno de los Siete Guerreros del Mar, que ha privado al país de lluvia y de confianza para que se rebele contra su rey. Entre oasis, guerreros del desierto y un ejército en marcha, la tripulación llega a Alubarna horas antes de que la guerra civil estalle de verdad. Allí Nico Robin, que trabajaba para Crocodile, elige su lado.",
        de: "Auf der Grand Line erfahren die Strohhüte, dass eine Geheimorganisation namens Baroque Works einen Staatsstreich in einem Wüstenkönigreich vorbereitet. Prinzessin Vivi reist unter falschem Namen mit ihnen, um ihn zu verhindern. Dahinter steckt Krokodil, einer der Sieben Samurai der Meere, der dem Land Regen und Vertrauen genommen hat, damit es sich gegen seinen König erhebt. Zwischen Oasen, Wüstenkriegern und einer marschierenden Armee erreicht die Crew Alubarna, Stunden bevor der Bürgerkrieg wirklich ausbricht. Hier entscheidet Nico Robin, die für Krokodil arbeitete, auf welcher Seite sie steht."
      }
    },
    {
      key: "cielo", vol: [24, 32], cap: [218, 303],
      nome: { it: "Isola del cielo", en: "Skypiea", ja: "空島編",
              fr: "Île du ciel", es: "Isla del cielo", de: "Himmelsinsel" },
      trama: {
        it: "Una mappa parla di un'isola che sta in cielo, e nessuno ci crede. Sull'isola di Jaya la ciurma incontra Montblanc Cricket, discendente di un esploratore che tutti presero per bugiardo, e sale davvero: una corrente d'acqua li spara sopra le nuvole. Lassù trovano un paese diviso, una guerra durata quattrocento anni fra gli abitanti del cielo e gli Shandia, e un dio che comanda il fulmine, Enel. Il punto dell'arco non è il duello: è la campana d'oro che suona alla fine, e che dimostra a chi è rimasto sotto che quell'esploratore diceva la verità.",
        en: "A map speaks of an island in the sky, and nobody believes it. On the island of Jaya the crew meet Mont Blanc Cricket, descendant of an explorer everyone took for a liar, and they really do go up: a column of water shoots them above the clouds. There they find a divided land, a war four hundred years old between the sky dwellers and the Shandia, and a god who commands lightning, Enel. The point of the arc is not the duel: it is the golden bell that rings at the end, proving to those left below that the explorer was telling the truth.",
        ja: "空にある島を記した地図があるが、誰も信じない。ジャヤ島で一味は、嘘つきと呼ばれた探検家の子孫モンブラン・クリケットと出会い、本当に空へ上がる。海流に打ち上げられ、雲の上へ。そこにあったのは分断された国、空の民とシャンディアが四百年続けてきた戦い、そして雷を操る神・エネル。この物語の核心は決闘ではない。最後に鳴り響く黄金の鐘だ。それは下に残った者たちに、あの探検家が真実を語っていたことを証明する。",
        fr: "Une carte parle d'une île dans le ciel, et personne n'y croit. Sur l'île de Jaya, l'équipage rencontre Montblanc Cricket, descendant d'un explorateur que tous prenaient pour un menteur, et ils montent vraiment : un courant d'eau les propulse au-dessus des nuages. Là-haut, ils trouvent un pays divisé, une guerre vieille de quatre cents ans entre les habitants du ciel et les Shandias, et un dieu qui commande la foudre, Ener. Le cœur de l'arc n'est pas le duel : c'est la cloche d'or qui sonne à la fin et prouve à ceux restés en bas que l'explorateur disait vrai.",
        es: "Un mapa habla de una isla que está en el cielo, y nadie lo cree. En la isla de Jaya la tripulación conoce a Montblanc Cricket, descendiente de un explorador al que todos tomaron por mentiroso, y suben de verdad: una corriente de agua los lanza por encima de las nubes. Allí encuentran un país dividido, una guerra de cuatrocientos años entre los habitantes del cielo y los shandia, y un dios que manda al rayo, Enel. El centro del arco no es el duelo: es la campana de oro que suena al final y demuestra a los que quedaron abajo que aquel explorador decía la verdad.",
        de: "Eine Karte spricht von einer Insel im Himmel, und niemand glaubt daran. Auf der Insel Jaya trifft die Crew Montblanc Cricket, Nachfahre eines Entdeckers, den alle für einen Lügner hielten — und sie steigen wirklich auf: eine Wassersäule schleudert sie über die Wolken. Dort finden sie ein geteiltes Land, einen vierhundert Jahre alten Krieg zwischen den Himmelsbewohnern und den Shandia, und einen Gott, der den Blitz befehligt: Enel. Der Kern des Bogens ist nicht das Duell, sondern die goldene Glocke, die am Ende erklingt und denen unten beweist, dass jener Entdecker die Wahrheit sagte."
      }
    },
    {
      key: "davy-back", vol: [32, 34], cap: [304, 321],
      nome: { it: "Davy Back Fight", en: "Davy Back Fight", ja: "デービーバックファイト編",
              fr: "Davy Back Fight", es: "Davy Back Fight", de: "Davy Back Fight" },
      trama: {
        it: "Su un'isola dalle maree lunghissime i Cappelli di paglia accettano una sfida fra pirati in cui in gioco non c'è il tesoro ma i compagni: chi perde una gara cede un membro della ciurma agli avversari. La ciurma di Foxy la Volpe argentata bara in ogni modo possibile. È l'arco più leggero della serie, e serve a mostrare che cosa significhi per Rufy perdere una persona invece di una moneta. Alla fine dell'isola arriva l'ammiraglio Aokiji, e in pochi minuti fa capire che la ciurma non è ancora pronta per quello che l'aspetta.",
        en: "On an island of enormous tides the Straw Hats accept a pirate contest where the stake is not treasure but crewmates: lose a game and you hand over a member. Foxy the Silver Fox's crew cheat in every way imaginable. It is the lightest arc in the series, and it exists to show what losing a person rather than a coin means to Luffy. As they leave, Admiral Aokiji arrives and in a few minutes makes plain that the crew are nowhere near ready for what is coming.",
        ja: "潮の満ち引きが極端な島で、麦わらの一味は海賊同士の勝負を受ける。賭けるのは宝ではなく仲間だ。負ければ乗組員を一人渡さねばならない。銀ギツネのフォクシー一味はあらゆる手で不正を働く。シリーズで最も軽い物語だが、ルフィにとって金ではなく人を失うとはどういうことかを描いている。島を離れる間際、大将青雉が現れ、わずか数分で、この一味がこれから待つものにまるで届いていないことを知らせる。",
        fr: "Sur une île aux marées démesurées, les Chapeaux de paille acceptent un défi entre pirates où l'enjeu n'est pas le trésor mais les équipiers : perdre une épreuve, c'est céder un membre de l'équipage. La bande de Foxy le Renard argenté triche de toutes les façons possibles. C'est l'arc le plus léger de la série, et il existe pour montrer ce que signifie, pour Luffy, perdre une personne plutôt qu'une pièce. Au moment de partir, l'amiral Aokiji arrive et fait comprendre en quelques minutes que l'équipage est très loin d'être prêt.",
        es: "En una isla de mareas enormes los Sombrero de Paja aceptan un desafío entre piratas en el que lo que se juega no es el tesoro sino los compañeros: quien pierde una prueba entrega a un miembro de la tripulación. La banda de Foxy el Zorro Plateado hace trampa de todas las formas posibles. Es el arco más ligero de la serie, y existe para mostrar lo que significa para Luffy perder a una persona en lugar de una moneda. Al irse llega el almirante Aokiji y en pocos minutos deja claro que la tripulación no está ni de lejos preparada.",
        de: "Auf einer Insel mit gewaltigen Gezeiten nehmen die Strohhüte einen Piratenwettkampf an, bei dem nicht Schätze auf dem Spiel stehen, sondern Crewmitglieder: Wer ein Spiel verliert, gibt einen Gefährten ab. Die Bande von Foxy dem Silberfuchs betrügt auf jede denkbare Weise. Es ist der leichteste Handlungsbogen der Serie, und er zeigt, was es für Ruffy bedeutet, einen Menschen statt einer Münze zu verlieren. Beim Aufbruch erscheint Admiral Aokiji und macht in wenigen Minuten klar, dass die Crew längst nicht bereit ist."
      }
    },
    {
      key: "water-seven", vol: [34, 39], cap: [322, 374],
      nome: { it: "Water Seven", en: "Water Seven", ja: "ウォーターセブン編",
              fr: "Water Seven", es: "Water Seven", de: "Water Seven" },
      trama: {
        it: "La Going Merry è a pezzi e i carpentieri di Water Seven dicono che non si può riparare: la sua chiglia è morta. Rufy decide di lasciarla, Usopp non accetta e sfida il suo capitano in duello per tenersela. Nello stesso momento Nico Robin scompare, e il governo mondiale accusa la ciurma di un attentato al sindaco della città. Dietro l'accusa c'è il CP9, un reparto di agenti infiltrati da anni fra i carpentieri. Robin non è stata rapita: se n'è andata da sola, per salvare la ciurma da quello che il governo le farebbe.",
        en: "The Going Merry is falling apart and the shipwrights of Water Seven say she cannot be repaired: her keel is dead. Luffy decides to leave her, Usopp refuses and challenges his own captain to a duel to keep her. At the same moment Nico Robin disappears, and the World Government accuses the crew of an attempt on the city's mayor. Behind the accusation is CP9, a unit of agents planted among the shipwrights for years. Robin was not kidnapped: she left of her own will, to save the crew from what the government would do to them.",
        ja: "ゴーイング・メリー号は限界を迎え、ウォーターセブンの船大工たちは修理できないと告げる。竜骨が死んでいるのだ。ルフィは船を降りる決断をし、ウソップは受け入れず、船を守るために船長へ決闘を挑む。同じ頃ニコ・ロビンが姿を消し、世界政府は一味を市長襲撃の犯人として告発する。その背後にいたのはCP9。何年も船大工たちのなかに潜んでいた諜報機関だ。ロビンはさらわれたのではない。政府が一味に何をするかを知って、自ら去ったのだった。",
        fr: "Le Vogue Merry tombe en morceaux et les charpentiers de Water Seven disent qu'il est irréparable : sa quille est morte. Luffy décide de l'abandonner, Usopp refuse et défie son propre capitaine en duel pour le garder. Au même moment, Nico Robin disparaît, et le Gouvernement mondial accuse l'équipage d'un attentat contre le maire de la ville. Derrière l'accusation se trouve le CP9, une unité d'agents infiltrés depuis des années parmi les charpentiers. Robin n'a pas été enlevée : elle est partie d'elle-même, pour sauver l'équipage de ce que le gouvernement leur ferait.",
        es: "El Going Merry se cae a pedazos y los carpinteros de Water Seven dicen que no se puede reparar: su quilla está muerta. Luffy decide dejarlo, Usopp no lo acepta y desafía a su propio capitán a un duelo para conservarlo. Al mismo tiempo Nico Robin desaparece, y el Gobierno Mundial acusa a la tripulación de un atentado contra el alcalde de la ciudad. Detrás de la acusación está el CP9, una unidad de agentes infiltrados durante años entre los carpinteros. Robin no ha sido secuestrada: se ha ido por su propia voluntad, para salvar a la tripulación de lo que el gobierno les haría.",
        de: "Die Flying Lamb fällt auseinander, und die Schiffszimmerer von Water Seven sagen, sie sei nicht zu reparieren: ihr Kiel ist tot. Ruffy entscheidet, sie zurückzulassen; Lysop weigert sich und fordert seinen eigenen Kapitän zum Duell, um sie zu behalten. Zur gleichen Zeit verschwindet Nico Robin, und die Weltregierung beschuldigt die Crew eines Anschlags auf den Bürgermeister der Stadt. Hinter der Anklage steht CP9, eine Einheit von Agenten, die seit Jahren unter den Schiffszimmerern lebten. Robin wurde nicht entführt: sie ging freiwillig, um die Crew vor dem zu bewahren, was die Regierung ihnen antun würde."
      }
    },
    {
      key: "enies-lobby", vol: [39, 46], cap: [375, 441],
      nome: { it: "Enies Lobby", en: "Enies Lobby", ja: "エニエス・ロビー編",
              fr: "Enies Lobby", es: "Enies Lobby", de: "Enies Lobby" },
      trama: {
        it: "Otto persone assaltano l'isola giudiziaria del governo mondiale per riprendersi una compagna. Enies Lobby non è un'isola da conquistare: è un tribunale con una porta che porta a una prigione da cui nessuno è mai tornato. Prima di combattere, Rufy chiede a Robin di dire ad alta voce che vuole vivere — perché il problema non era il governo, era che lei aveva smesso di crederci. Poi ordina di bruciare la bandiera del governo mondiale, che significa dichiarare guerra al mondo. L'arco finisce con due funerali: quello della Going Merry, e quello di un'amicizia ricucita all'ultimo momento.",
        en: "Eight people storm the World Government's judicial island to take back a friend. Enies Lobby is not an island to conquer: it is a courthouse with a gate leading to a prison no one has ever returned from. Before fighting, Luffy asks Robin to say out loud that she wants to live — because the problem was never the government, it was that she had stopped believing it. Then he orders the World Government's flag burned, which means declaring war on the world. The arc ends with two funerals: the Going Merry's, and that of a friendship mended at the last moment.",
        ja: "たった八人が、仲間を取り戻すために世界政府の司法の島へ攻め込む。エニエス・ロビーは攻め落とす島ではない。誰も戻ったことのない監獄へ続く門を持つ裁判所だ。戦う前にルフィはロビンに、生きたいと声に出して言えと求める。問題は政府ではなく、彼女がそれを信じるのをやめていたことだったからだ。そしてルフィは世界政府の旗を撃て と命じる。それは世界への宣戦布告を意味する。物語は二つの葬送で終わる。ゴーイング・メリー号と、最後の瞬間に繕われた友情の。",
        fr: "Huit personnes prennent d'assaut l'île judiciaire du Gouvernement mondial pour reprendre une amie. Enies Lobby n'est pas une île à conquérir : c'est un tribunal avec une porte menant à une prison dont personne n'est jamais revenu. Avant de se battre, Luffy demande à Robin de dire à voix haute qu'elle veut vivre — car le problème n'a jamais été le gouvernement, mais qu'elle avait cessé d'y croire. Puis il ordonne de brûler le drapeau du Gouvernement mondial, ce qui signifie déclarer la guerre au monde. L'arc s'achève sur deux funérailles : celles du Vogue Merry, et celles d'une amitié recousue au dernier moment.",
        es: "Ocho personas asaltan la isla judicial del Gobierno Mundial para recuperar a una compañera. Enies Lobby no es una isla que conquistar: es un tribunal con una puerta que lleva a una prisión de la que nadie ha vuelto. Antes de luchar, Luffy pide a Robin que diga en voz alta que quiere vivir — porque el problema nunca fue el gobierno, sino que ella había dejado de creerlo. Después ordena quemar la bandera del Gobierno Mundial, lo que significa declarar la guerra al mundo. El arco termina con dos funerales: el del Going Merry y el de una amistad recosida en el último momento.",
        de: "Acht Menschen stürmen die Gerichtsinsel der Weltregierung, um eine Gefährtin zurückzuholen. Enies Lobby ist keine Insel, die man erobert: es ist ein Gerichtshof mit einem Tor zu einem Gefängnis, aus dem niemand je zurückkam. Vor dem Kampf verlangt Ruffy von Robin, laut zu sagen, dass sie leben will — denn das Problem war nie die Regierung, sondern dass sie aufgehört hatte, daran zu glauben. Dann befiehlt er, die Flagge der Weltregierung zu verbrennen, was eine Kriegserklärung an die Welt bedeutet. Der Bogen endet mit zwei Begräbnissen: dem der Flying Lamb und dem einer im letzten Moment geflickten Freundschaft."
      }
    },
    {
      key: "thriller", vol: [46, 50], cap: [442, 490],
      nome: { it: "Thriller Bark", en: "Thriller Bark", ja: "スリラーバーク編",
              fr: "Thriller Bark", es: "Thriller Bark", de: "Thriller Bark" },
      trama: {
        it: "Su una nave grande come un'isola, dentro una nebbia permanente, Gecko Moria ruba le ombre delle persone e le infila nei cadaveri per farsi un esercito. Chi perde l'ombra non può più stare al sole. Qui la ciurma trova Brook, uno scheletro che suona il violino e che cerca la propria ombra da cinquant'anni. Alla fine, quando tutti sono a terra, arriva il corsaro Bartholomew Kuma e offre a Zoro uno scambio: la vita del suo capitano al prezzo della propria. Zoro accetta senza dirlo a nessuno, e la mattina dopo lo trovano in piedi in una pozza di sangue.",
        en: "On a ship as large as an island, inside permanent fog, Gecko Moria steals people's shadows and stuffs them into corpses to build himself an army. Whoever loses their shadow can no longer stand in sunlight. Here the crew find Brook, a skeleton who plays the violin and has been looking for his own shadow for fifty years. At the end, with everyone on the ground, the warlord Bartholomew Kuma offers Zoro a trade: his captain's life for his own. Zoro accepts without telling anyone, and the next morning they find him standing in a pool of blood.",
        ja: "島ほど大きな船の上、晴れることのない霧の中で、ゲッコー・モリアは人の影を奪い、死体に入れて軍勢を作っていた。影を失った者は二度と日の光の下に立てない。ここで一味は、バイオリンを弾く骸骨ブルックと出会う。五十年ものあいだ自分の影を探してきた男だ。すべてが終わり全員が倒れた後、七武海バーソロミュー・くまが現れ、ゾロに取引を持ちかける。船長の命の代わりに自分の命を出せと。ゾロは誰にも言わずそれを受け、翌朝、血の海の中に立っている姿で見つかる。",
        fr: "Sur un navire aussi grand qu'une île, dans un brouillard permanent, Gecko Moria vole les ombres des gens et les glisse dans des cadavres pour se bâtir une armée. Celui qui perd son ombre ne peut plus rester au soleil. C'est là que l'équipage trouve Brook, un squelette qui joue du violon et cherche sa propre ombre depuis cinquante ans. À la fin, tous à terre, le corsaire Bartholomew Kuma propose à Zoro un échange : la vie de son capitaine contre la sienne. Zoro accepte sans le dire à personne, et au matin on le retrouve debout dans une mare de sang.",
        es: "En un barco tan grande como una isla, dentro de una niebla permanente, Gecko Moria roba las sombras de la gente y las mete en cadáveres para hacerse un ejército. Quien pierde su sombra ya no puede estar al sol. Aquí la tripulación encuentra a Brook, un esqueleto que toca el violín y busca su propia sombra desde hace cincuenta años. Al final, con todos en el suelo, el guerrero del mar Bartholomew Kuma ofrece a Zoro un intercambio: la vida de su capitán a cambio de la suya. Zoro acepta sin decírselo a nadie, y a la mañana siguiente lo encuentran de pie en un charco de sangre.",
        de: "Auf einem Schiff so groß wie eine Insel, in immerwährendem Nebel, raubt Gecko Moria den Menschen ihre Schatten und steckt sie in Leichen, um sich ein Heer zu bauen. Wer seinen Schatten verliert, kann nicht mehr im Sonnenlicht stehen. Hier findet die Crew Brook, ein Skelett, das Geige spielt und seit fünfzig Jahren seinen eigenen Schatten sucht. Am Ende, als alle am Boden liegen, bietet der Samurai Bartholomäus Bär Zorro einen Tausch: das Leben seines Kapitäns gegen sein eigenes. Zorro nimmt an, ohne es jemandem zu sagen, und am Morgen findet man ihn stehend in einer Blutlache."
      }
    },
    {
      key: "sabaody", vol: [50, 53], cap: [491, 513],
      nome: { it: "Arcipelago Sabaody", en: "Sabaody Archipelago", ja: "シャボンディ諸島編",
              fr: "Archipel Sabaody", es: "Archipiélago Sabaody", de: "Sabaody-Archipel" },
      trama: {
        it: "Ultimo scalo prima del Nuovo Mondo: un arcipelago di alberi che fanno bolle, dove si rivestono le navi per scendere sott'acqua. È anche il posto dove si tiene un'asta di schiavi, e dove i Draghi Celesti — i discendenti dei fondatori del governo mondiale — camminano con un casco per non respirare la stessa aria della gente comune. Rufy ne prende uno a pugni in faccia davanti a tutti. La risposta arriva in poche ore: un ammiraglio e Bartholomew Kuma. La ciurma non viene sconfitta, viene cancellata: Kuma spedisce ognuno dei nove in un punto diverso del mondo.",
        en: "Last stop before the New World: an archipelago of trees that make bubbles, where ships are coated to travel underwater. It is also where a slave auction is held, and where the Celestial Dragons — descendants of the World Government's founders — walk inside helmets so as not to breathe the same air as ordinary people. Luffy punches one of them in the face in front of everyone. The answer comes within hours: an admiral, and Bartholomew Kuma. The crew is not defeated, it is erased: Kuma sends each of the nine to a different corner of the world.",
        ja: "新世界へ入る前の最後の島。シャボン玉を作る木々の群島で、船に樹脂を塗って海底へ潜る準備をする場所だ。そしてここでは奴隷の競売が開かれ、世界政府創設者の末裔である天竜人が、庶民と同じ空気を吸わぬようヘルメットをかぶって歩いている。ルフィはその一人を、皆の前で殴り倒す。報復は数時間で来た。大将と、バーソロミュー・くま。一味は敗れたのではなく、消された。くまは九人それぞれを世界の別々の場所へ飛ばしてしまう。",
        fr: "Dernière escale avant le Nouveau Monde : un archipel d'arbres à bulles, où l'on revêt les navires pour descendre sous l'eau. C'est aussi là que se tient une vente aux enchères d'esclaves, et où les Dragons Célestes — descendants des fondateurs du Gouvernement mondial — marchent sous un casque pour ne pas respirer le même air que les gens ordinaires. Luffy en frappe un au visage devant tout le monde. La réponse arrive en quelques heures : un amiral, et Bartholomew Kuma. L'équipage n'est pas vaincu, il est effacé : Kuma envoie chacun des neuf dans un endroit différent du monde.",
        es: "Última parada antes del Nuevo Mundo: un archipiélago de árboles que hacen burbujas, donde se recubren los barcos para bajar bajo el agua. Es también donde se celebra una subasta de esclavos, y donde los Dragones Celestiales — descendientes de los fundadores del Gobierno Mundial — caminan con un casco para no respirar el mismo aire que la gente común. Luffy le da un puñetazo en la cara a uno de ellos delante de todos. La respuesta llega en pocas horas: un almirante y Bartholomew Kuma. La tripulación no es derrotada, es borrada: Kuma envía a cada uno de los nueve a un lugar distinto del mundo.",
        de: "Letzter Halt vor der Neuen Welt: ein Archipel aus Bäumen, die Blasen erzeugen, wo Schiffe beschichtet werden, um unter Wasser zu fahren. Hier findet auch eine Sklavenauktion statt, und hier gehen die Himmelsdrachen — Nachfahren der Gründer der Weltregierung — unter Helmen umher, um nicht dieselbe Luft wie gewöhnliche Menschen zu atmen. Ruffy schlägt einem von ihnen vor allen ins Gesicht. Die Antwort kommt in Stunden: ein Admiral und Bartholomäus Bär. Die Crew wird nicht besiegt, sie wird ausgelöscht: Bär schickt jeden der neun an einen anderen Ort der Welt."
      }
    },
    {
      key: "amazon-lily", vol: [53, 54], cap: [514, 524],
      nome: { it: "Amazon Lily", en: "Amazon Lily", ja: "女ヶ島アマゾン・リリー編",
              fr: "Amazon Lily", es: "Amazon Lily", de: "Amazon Lily" },
      trama: {
        it: "Rufy si sveglia su un'isola dove vivono solo donne e dove gli uomini sono vietati per legge. La regina è Boa Hancock, corsara e Imperatrice dei pirati, che odia gli uomini per una ragione che nessuno sull'isola conosce. Mentre cerca un modo per tornare dai suoi, Rufy scopre dal giornale che suo fratello Ace sta per essere giustiziato dalla Marina. Da quel momento l'arco cambia direzione: non si tratta più di ritrovare la ciurma, ma di arrivare a una prigione sottomarina prima che sia troppo tardi.",
        en: "Luffy wakes on an island inhabited only by women, where men are forbidden by law. Its queen is Boa Hancock, warlord and Pirate Empress, who hates men for a reason nobody on the island knows. While looking for a way back to his crew, Luffy learns from a newspaper that his brother Ace is about to be executed by the Marines. From that moment the arc changes direction: it is no longer about finding the crew, but about reaching an undersea prison before it is too late.",
        ja: "ルフィは女しか住まない島で目を覚ます。法によって男の立ち入りが禁じられた島だ。女王は七武海であり海賊女帝でもあるボア・ハンコック。島の誰も知らぬ理由で男を憎んでいる。仲間の元へ戻る道を探すなかで、ルフィは新聞から兄エースが海軍に処刑されようとしていることを知る。ここから物語の向きが変わる。もはや仲間を探す話ではない。手遅れになる前に海底の監獄へたどり着く話になる。",
        fr: "Luffy se réveille sur une île peuplée uniquement de femmes, où les hommes sont interdits par la loi. Sa reine est Boa Hancock, corsaire et Impératrice des pirates, qui hait les hommes pour une raison que personne sur l'île ne connaît. Alors qu'il cherche un moyen de rejoindre son équipage, Luffy apprend par un journal que son frère Ace va être exécuté par la Marine. Dès cet instant, l'arc change de direction : il ne s'agit plus de retrouver l'équipage, mais d'atteindre une prison sous-marine avant qu'il ne soit trop tard.",
        es: "Luffy despierta en una isla habitada solo por mujeres, donde los hombres están prohibidos por ley. Su reina es Boa Hancock, guerrera del mar y Emperatriz pirata, que odia a los hombres por una razón que nadie en la isla conoce. Mientras busca cómo volver con su tripulación, Luffy se entera por un periódico de que su hermano Ace va a ser ejecutado por la Marina. Desde ese momento el arco cambia de dirección: ya no se trata de encontrar a la tripulación, sino de llegar a una prisión submarina antes de que sea tarde.",
        de: "Ruffy erwacht auf einer Insel, auf der nur Frauen leben und Männer per Gesetz verboten sind. Ihre Königin ist Boa Hancock, Samurai der Meere und Piratenkaiserin, die Männer aus einem Grund hasst, den niemand auf der Insel kennt. Während er einen Weg zurück zu seiner Crew sucht, erfährt Ruffy aus einer Zeitung, dass sein Bruder Ace von der Marine hingerichtet werden soll. Von diesem Moment an ändert der Bogen die Richtung: es geht nicht mehr darum, die Crew zu finden, sondern ein Unterwassergefängnis zu erreichen, bevor es zu spät ist."
      }
    },
    {
      key: "impel-down", vol: [54, 56], cap: [525, 549],
      nome: { it: "Impel Down", en: "Impel Down", ja: "インペルダウン編",
              fr: "Impel Down", es: "Impel Down", de: "Impel Down" },
      trama: {
        it: "Impel Down è la prigione del governo mondiale: sei livelli che scendono sotto il mare, ognuno peggiore del precedente, e nessuna evasione nella sua storia. Rufy entra di nascosto per arrivare al fratello e scopre che è già stato portato via. Per uscire deve allearsi con i suoi nemici: il pagliaccio Bagy, Crocodile, Bon Clay. L'arco è una corsa verso il basso e poi verso l'alto, e il pezzo che resta è il sacrificio di Bon Clay, un personaggio comico che sceglie di restare indietro per tenere aperto un portone.",
        en: "Impel Down is the World Government's prison: six levels descending below the sea, each worse than the last, and not one escape in its history. Luffy sneaks in to reach his brother and finds he has already been taken away. To get out he has to ally with his own enemies: the clown Buggy, Crocodile, Bon Clay. The arc is a race downward and then upward, and what stays with you is Bon Clay's sacrifice — a comic character who chooses to stay behind to hold a gate open.",
        ja: "インペルダウンは世界政府の大監獄。海の底へ向かって六つの層が下り、下るほど酷くなり、その歴史に脱獄者は一人もいない。ルフィは兄に会うため忍び込むが、すでに移送されたことを知る。脱出には敵と手を組まねばならない。道化のバギー、クロコダイル、ボン・クレー。物語は下へ、そして上への競走であり、心に残るのはボン・クレーの犠牲だ。笑いを担っていた人物が、扉を開けておくために自ら残ることを選ぶ。",
        fr: "Impel Down est la prison du Gouvernement mondial : six niveaux qui descendent sous la mer, chacun pire que le précédent, et pas une évasion dans son histoire. Luffy s'y infiltre pour rejoindre son frère et découvre qu'il a déjà été emmené. Pour sortir, il doit s'allier à ses propres ennemis : le clown Baggy, Crocodile, Bon Clay. L'arc est une course vers le bas puis vers le haut, et ce qui reste, c'est le sacrifice de Bon Clay — un personnage comique qui choisit de rester en arrière pour maintenir une porte ouverte.",
        es: "Impel Down es la prisión del Gobierno Mundial: seis niveles que bajan bajo el mar, cada uno peor que el anterior, y ni una fuga en su historia. Luffy se cuela para llegar a su hermano y descubre que ya se lo han llevado. Para salir tiene que aliarse con sus propios enemigos: el payaso Buggy, Crocodile, Bon Clay. El arco es una carrera hacia abajo y luego hacia arriba, y lo que queda es el sacrificio de Bon Clay — un personaje cómico que elige quedarse atrás para mantener abierta una puerta.",
        de: "Impel Down ist das Gefängnis der Weltregierung: sechs Ebenen, die unter das Meer hinabführen, jede schlimmer als die vorige, und kein einziger Ausbruch in seiner Geschichte. Ruffy schleicht sich hinein, um seinen Bruder zu erreichen, und erfährt, dass dieser längst weggebracht wurde. Um herauszukommen, muss er sich mit seinen eigenen Feinden verbünden: dem Clown Buggy, Krokodil, Bon Curry. Der Bogen ist ein Wettlauf nach unten und dann nach oben, und was bleibt, ist Bon Currys Opfer — eine komische Figur, die zurückbleibt, um ein Tor offen zu halten."
      }
    },
    {
      key: "marineford", vol: [56, 61], cap: [550, 597],
      nome: { it: "Guerra dei vertici (Marineford)", en: "Marineford — the Summit War", ja: "マリンフォード頂上戦争編",
              fr: "Guerre au sommet (Marine Ford)", es: "Guerra de Marineford", de: "Gipfelkrieg (Marineford)" },
      trama: {
        it: "L'esecuzione di Ace è una trappola: la Marina la usa per attirare Barbabianca, l'uomo più vicino al titolo di Re dei pirati, e finirla in un colpo solo. Nella piazza di Marineford si affrontano tre ammiragli, i corsari, la flotta di Barbabianca e un ragazzo arrivato da solo per salvare il fratello. Ace muore fra le braccia di Rufy. Barbabianca muore in piedi, dicendo al mondo che lo One Piece esiste. Barbanera prende il suo potere. È l'arco in cui Rufy perde tutto e prende la decisione che cambia la serie: non ripartire subito, ma sparire per due anni e diventare abbastanza forte.",
        en: "Ace's execution is a trap: the Marines use it to draw out Whitebeard, the man closest to the title of Pirate King, and finish him in one stroke. In the plaza of Marineford three admirals, the warlords, Whitebeard's fleet and a boy who came alone to save his brother all collide. Ace dies in Luffy's arms. Whitebeard dies on his feet, telling the world the One Piece is real. Blackbeard takes his power. This is the arc where Luffy loses everything and makes the decision that changes the series: not to set out again at once, but to disappear for two years and become strong enough.",
        ja: "エースの処刑は罠だった。海軍はそれを餌に、海賊王の座に最も近い男・白ひげを引きずり出し、一度で終わらせようとする。マリンフォードの広場で、三人の大将、七武海、白ひげ海賊団、そして兄を救うためにたった一人で来た少年がぶつかり合う。エースはルフィの腕の中で死ぬ。白ひげは立ったまま死に、ワンピースは実在すると世界に告げる。その力を黒ひげが奪う。ルフィがすべてを失い、シリーズを変える決断をする物語だ。すぐには再出発せず、二年間姿を消し、十分に強くなること。",
        fr: "L'exécution d'Ace est un piège : la Marine s'en sert pour attirer Barbe Blanche, l'homme le plus proche du titre de Roi des pirates, et l'achever d'un coup. Sur la place de Marine Ford s'affrontent trois amiraux, les corsaires, la flotte de Barbe Blanche et un garçon venu seul sauver son frère. Ace meurt dans les bras de Luffy. Barbe Blanche meurt debout, en disant au monde que le One Piece existe. Barbe Noire lui prend son pouvoir. C'est l'arc où Luffy perd tout et prend la décision qui change la série : ne pas repartir tout de suite, mais disparaître deux ans et devenir assez fort.",
        es: "La ejecución de Ace es una trampa: la Marina la usa para atraer a Barbablanca, el hombre más cercano al título de Rey de los Piratas, y acabar con él de un golpe. En la plaza de Marineford se enfrentan tres almirantes, los guerreros del mar, la flota de Barbablanca y un chico que ha venido solo a salvar a su hermano. Ace muere en brazos de Luffy. Barbablanca muere de pie, diciéndole al mundo que el One Piece existe. Barbanegra le arrebata su poder. Es el arco en el que Luffy lo pierde todo y toma la decisión que cambia la serie: no volver a partir enseguida, sino desaparecer dos años y hacerse lo bastante fuerte.",
        de: "Aces Hinrichtung ist eine Falle: die Marine nutzt sie, um Whitebeard hervorzulocken — den Mann, der dem Titel des Piratenkönigs am nächsten ist — und ihn in einem Zug zu erledigen. Auf dem Platz von Marineford treffen drei Admirale, die Samurai der Meere, Whitebeards Flotte und ein Junge aufeinander, der allein gekommen ist, um seinen Bruder zu retten. Ace stirbt in Ruffys Armen. Whitebeard stirbt stehend und sagt der Welt, dass das One Piece existiert. Blackbeard nimmt ihm seine Kraft. Es ist der Bogen, in dem Ruffy alles verliert und die Entscheidung trifft, die die Serie verändert: nicht gleich wieder aufzubrechen, sondern zwei Jahre zu verschwinden und stark genug zu werden."
      }
    },
    {
      key: "uomini-pesce", vol: [61, 66], cap: [598, 653],
      nome: { it: "Isola degli uomini-pesce", en: "Fish-Man Island", ja: "魚人島編",
              fr: "Île des hommes-poissons", es: "Isla Gyojin", de: "Fischmenscheninsel" },
      trama: {
        it: "Dopo due anni la ciurma si ritrova e scende diecimila metri sotto il mare, dentro una bolla, verso un'isola abitata da uomini-pesce e sirene. Il tema non è un nemico: è il razzismo. Gli uomini-pesce sono stati schiavi degli umani per generazioni, e una parte di loro vuole restituire il colpo. La regina Otohime aveva passato la vita a raccogliere firme per portare il suo popolo in superficie, e per questo è stata uccisa. Hody Jones, il capo dei Nuovi pirati uomini-pesce, odia gli umani senza averne mai incontrato uno: l'odio l'ha ereditato.",
        en: "After two years the crew reunites and descends ten thousand metres below the sea, inside a bubble, toward an island of fish-men and mermaids. The theme is not a villain: it is racism. Fish-men were enslaved by humans for generations, and some of them want to strike back. Queen Otohime spent her life collecting signatures to bring her people to the surface, and was killed for it. Hody Jones, leader of the New Fish-Man Pirates, hates humans without ever having met one: he inherited the hatred.",
        ja: "二年後、一味は再び集まり、シャボンに包まれて海面下一万メートルへ潜る。魚人と人魚が住む島へ。ここで描かれるのは敵ではなく、差別だ。魚人たちは何世代も人間の奴隷とされ、その一部は報復を望んでいる。王妃オトヒメは民を地上へ導くため、生涯を署名集めに費やし、そのために殺された。新魚人海賊団を率いるホーディ・ジョーンズは、人間に一度も会ったことがないまま人間を憎む。その憎しみは受け継いだものだ。",
        fr: "Après deux ans, l'équipage se retrouve et descend à dix mille mètres sous la mer, dans une bulle, vers une île d'hommes-poissons et de sirènes. Le thème n'est pas un ennemi : c'est le racisme. Les hommes-poissons ont été esclaves des humains pendant des générations, et une partie d'entre eux veut rendre les coups. La reine Otohime a passé sa vie à récolter des signatures pour amener son peuple à la surface, et elle en est morte. Hody Jones, chef des Nouveaux pirates hommes-poissons, haït les humains sans en avoir jamais rencontré un seul : cette haine, il l'a héritée.",
        es: "Tras dos años la tripulación se reúne y baja diez mil metros bajo el mar, dentro de una burbuja, hacia una isla habitada por gyojin y sirenas. El tema no es un enemigo: es el racismo. Los gyojin fueron esclavos de los humanos durante generaciones, y una parte de ellos quiere devolver el golpe. La reina Otohime pasó su vida recogiendo firmas para llevar a su pueblo a la superficie, y por eso fue asesinada. Hody Jones, jefe de los Nuevos Piratas Gyojin, odia a los humanos sin haber conocido nunca a ninguno: el odio lo heredó.",
        de: "Nach zwei Jahren findet die Crew wieder zusammen und taucht zehntausend Meter unter das Meer, in einer Blase, zu einer Insel der Fischmenschen und Meerjungfrauen. Das Thema ist kein Feind: es ist Rassismus. Fischmenschen waren über Generationen Sklaven der Menschen, und ein Teil von ihnen will zurückschlagen. Königin Otohime verbrachte ihr Leben damit, Unterschriften zu sammeln, um ihr Volk an die Oberfläche zu bringen, und wurde dafür getötet. Hody Jones, Anführer der Neuen Fischmenschen-Piraten, hasst Menschen, ohne je einem begegnet zu sein: den Hass hat er geerbt."
      }
    },
    {
      key: "punk-hazard", vol: [66, 70], cap: [654, 700],
      nome: { it: "Punk Hazard", en: "Punk Hazard", ja: "パンクハザード編",
              fr: "Punk Hazard", es: "Punk Hazard", de: "Punk Hazard" },
      trama: {
        it: "Un'isola spaccata in due, metà in fiamme e metà ghiacciata, risultato di un esperimento finito male. Su quell'isola lo scienziato Caesar Clown produce un'arma chimica e tiene prigionieri dei bambini rapiti in tutto il mondo, ingranditi a forza con una droga. Qui la ciurma incontra Trafalgar Law, che propone un'alleanza per abbattere uno dei Quattro Imperatori: non si attacca un imperatore di petto, si comincia togliendogli i fornitori. È l'arco in cui la storia smette di essere un'isola dopo l'altra e diventa una guerra con un piano.",
        en: "An island split in two, half on fire and half frozen, the result of an experiment that went wrong. On it the scientist Caesar Clown manufactures a chemical weapon and keeps children kidnapped from across the world, force-grown with a drug. Here the crew meet Trafalgar Law, who proposes an alliance to bring down one of the Four Emperors: you do not attack an emperor head-on, you start by taking away his suppliers. This is the arc where the story stops being one island after another and becomes a war with a plan.",
        ja: "半分が燃え、半分が凍りついた、実験の失敗によって二つに裂かれた島。そこで科学者シーザー・クラウンは化学兵器を作り、世界各地からさらった子供たちを薬で無理に巨大化させて閉じ込めていた。ここで一味はトラファルガー・ローと出会う。四皇の一人を倒すための同盟を持ちかける男だ。皇帝には正面から挑まない。まず供給元を奪う。物語が「島の次の島」であることをやめ、計画を持つ戦争になる転換点だ。",
        fr: "Une île coupée en deux, moitié en flammes et moitié gelée, résultat d'une expérience qui a mal tourné. Le scientifique César Clown y fabrique une arme chimique et y retient des enfants enlevés dans le monde entier, grandis de force par une drogue. C'est là que l'équipage rencontre Trafalgar Law, qui propose une alliance pour abattre l'un des Quatre Empereurs : on n'attaque pas un empereur de front, on commence par lui retirer ses fournisseurs. C'est l'arc où l'histoire cesse d'être une île après l'autre et devient une guerre avec un plan.",
        es: "Una isla partida en dos, mitad en llamas y mitad helada, resultado de un experimento que salió mal. En ella el científico Caesar Clown fabrica un arma química y retiene a niños secuestrados por todo el mundo, agrandados a la fuerza con una droga. Aquí la tripulación conoce a Trafalgar Law, que propone una alianza para derribar a uno de los Cuatro Emperadores: a un emperador no se le ataca de frente, se empieza quitándole a sus proveedores. Es el arco en el que la historia deja de ser una isla tras otra y se convierte en una guerra con un plan.",
        de: "Eine in zwei Hälften gespaltene Insel, halb brennend und halb gefroren, das Ergebnis eines missglückten Experiments. Dort stellt der Wissenschaftler Caesar Clown eine chemische Waffe her und hält Kinder gefangen, die weltweit entführt und mit einer Droge zwangsweise vergrößert wurden. Hier trifft die Crew Trafalgar Law, der ein Bündnis vorschlägt, um einen der Vier Kaiser zu stürzen: einen Kaiser greift man nicht frontal an, man beginnt damit, ihm die Lieferanten zu nehmen. Es ist der Bogen, in dem die Geschichte aufhört, eine Insel nach der anderen zu sein, und ein Krieg mit einem Plan wird."
      }
    },
    {
      key: "dressrosa", vol: [71, 80], cap: [701, 801],
      nome: { it: "Dressrosa", en: "Dressrosa", ja: "ドレスローザ編",
              fr: "Dressrosa", es: "Dressrosa", de: "Dressrosa" },
      trama: {
        it: "Un regno di fiori e arene dove tutti sembrano felici, governato da Donquijote Doflamingo. La felicità è costruita: Doflamingo ha un potere che trasforma le persone in giocattoli, e chi diventa giocattolo viene dimenticato da tutti, anche dalla propria famiglia. Migliaia di persone vivono così, e nessuno sa che manca qualcuno. Rufy entra in un torneo dell'arena per un frutto del diavolo e finisce in una rivoluzione lunga dieci anni, fianco a fianco con un ex re ridotto a soldatino di legno e con sua figlia, che non sa di averne uno.",
        en: "A kingdom of flowers and arenas where everyone seems happy, ruled by Donquixote Doflamingo. The happiness is manufactured: Doflamingo has a power that turns people into toys, and whoever becomes a toy is forgotten by everyone, even their own family. Thousands live like that, and nobody knows anyone is missing. Luffy enters a colosseum tournament for a Devil Fruit and lands in a revolution ten years in the making, alongside a former king reduced to a wooden soldier and his daughter, who does not know she has a father.",
        ja: "花と闘技場の王国。誰もが幸せそうに見える国を治めるのはドンキホーテ・ドフラミンゴ。その幸福は作られたものだ。ドフラミンゴは人をおもちゃに変える力を持ち、おもちゃになった者は家族からさえ忘れられる。何千人もがそうして生き、誰も「いなくなった人がいる」ことを知らない。ルフィは悪魔の実を賭けたコロシアムの大会に出て、十年越しの革命のなかへ放り込まれる。木のおもちゃの兵隊に変えられた元国王と、父の存在を知らないその娘とともに。",
        fr: "Un royaume de fleurs et d'arènes où tout le monde semble heureux, gouverné par Donquixote Doflamingo. Ce bonheur est fabriqué : Doflamingo possède un pouvoir qui transforme les gens en jouets, et celui qui devient jouet est oublié de tous, même de sa propre famille. Des milliers de personnes vivent ainsi, et personne ne sait qu'il manque quelqu'un. Luffy entre dans un tournoi du colisée pour un fruit du démon et tombe dans une révolution préparée depuis dix ans, aux côtés d'un ancien roi réduit à un soldat de bois et de sa fille, qui ignore avoir un père.",
        es: "Un reino de flores y arenas donde todos parecen felices, gobernado por Donquixote Doflamingo. La felicidad está fabricada: Doflamingo tiene un poder que convierte a las personas en juguetes, y quien se convierte en juguete es olvidado por todos, incluso por su propia familia. Miles de personas viven así, y nadie sabe que falta alguien. Luffy entra en un torneo del coliseo por una fruta del diablo y acaba en una revolución preparada durante diez años, junto a un antiguo rey reducido a soldadito de madera y a su hija, que no sabe que tiene padre.",
        de: "Ein Königreich aus Blumen und Arenen, in dem alle glücklich scheinen, regiert von Don Quichotte de Flamingo. Das Glück ist hergestellt: de Flamingo besitzt eine Kraft, die Menschen in Spielzeug verwandelt, und wer zum Spielzeug wird, ist von allen vergessen, sogar von der eigenen Familie. Tausende leben so, und niemand weiß, dass jemand fehlt. Ruffy tritt in einem Kolosseum-Turnier um eine Teufelsfrucht an und landet in einer seit zehn Jahren vorbereiteten Revolution — an der Seite eines früheren Königs, der zu einem Holzsoldaten wurde, und seiner Tochter, die nicht weiß, dass sie einen Vater hat."
      }
    },
    {
      key: "zo", vol: [80, 82], cap: [802, 822],
      nome: { it: "Zo", en: "Zou", ja: "ゾウ編",
              fr: "Zo", es: "Zou", de: "Zou" },
      trama: {
        it: "Un'isola che cammina: un elefante alto mille metri che attraversa il mare da mille anni, con una città sulla schiena. Ci vivono i Mink, un popolo di animali antropomorfi, appena sopravvissuto a un massacro. Qui la ciurma, divisa in due gruppi dal viaggio, si ricompone e scopre che i samurai del Paese di Wa, i Mink e i pirati hanno tutti lo stesso nemico: Kaido, uno dei Quattro Imperatori. Ed è qui che arriva l'invito che farà partire l'arco successivo: Sanji è atteso al suo matrimonio, con una famiglia che non ha mai voluto.",
        en: "An island that walks: an elephant a thousand metres tall that has been crossing the sea for a thousand years, with a city on its back. The Minks live there, a people of anthropomorphic animals who have just survived a massacre. Here the crew, split in two by the voyage, comes back together and learns that the samurai of Wano, the Minks and the pirates all share one enemy: Kaido, one of the Four Emperors. And here arrives the invitation that launches the next arc: Sanji is expected at his own wedding, by a family he never wanted.",
        ja: "歩く島。千年ものあいだ海を渡ってきた、身の丈千メートルの象で、その背に町が乗っている。住むのはミンク族、獣人の一族で、虐殺をかろうじて生き延びたばかりだ。航海で二手に分かれていた一味はここで再び合流し、ワノ国の侍、ミンク族、そして海賊が同じ敵を持つことを知る。四皇の一人、カイドウだ。そして次の物語を動かす招待状が届く。サンジが自らの結婚式に呼ばれている。望んだことのない家族から。",
        fr: "Une île qui marche : un éléphant de mille mètres de haut qui traverse la mer depuis mille ans, avec une ville sur le dos. Y vivent les Minks, un peuple d'animaux anthropomorphes qui vient de survivre à un massacre. Ici l'équipage, séparé en deux par le voyage, se reforme et découvre que les samouraïs du Pays des Wa, les Minks et les pirates ont tous le même ennemi : Kaido, l'un des Quatre Empereurs. Et c'est ici qu'arrive l'invitation qui lancera l'arc suivant : Sanji est attendu à son propre mariage, par une famille dont il n'a jamais voulu.",
        es: "Una isla que camina: un elefante de mil metros de alto que atraviesa el mar desde hace mil años, con una ciudad sobre el lomo. Allí viven los mink, un pueblo de animales antropomorfos que acaba de sobrevivir a una masacre. Aquí la tripulación, partida en dos por el viaje, se reúne de nuevo y descubre que los samuráis del País de Wano, los mink y los piratas tienen todos el mismo enemigo: Kaido, uno de los Cuatro Emperadores. Y aquí llega la invitación que pondrá en marcha el arco siguiente: Sanji está esperado en su propia boda, por una familia que nunca quiso.",
        de: "Eine Insel, die geht: ein tausend Meter hoher Elefant, der seit tausend Jahren das Meer durchquert, mit einer Stadt auf dem Rücken. Dort leben die Minks, ein Volk anthropomorpher Tiere, das eben ein Massaker überlebt hat. Hier findet die durch die Reise geteilte Crew wieder zusammen und erfährt, dass die Samurai von Wano, die Minks und die Piraten denselben Feind haben: Kaido, einen der Vier Kaiser. Und hier kommt die Einladung an, die den nächsten Bogen auslöst: Sanji wird auf seiner eigenen Hochzeit erwartet — von einer Familie, die er nie wollte."
      }
    },
    {
      key: "whole-cake", vol: [82, 90], cap: [823, 902],
      nome: { it: "Whole Cake Island", en: "Whole Cake Island", ja: "ホールケーキアイランド編",
              fr: "Whole Cake Island", es: "Whole Cake Island", de: "Whole Cake Island" },
      trama: {
        it: "Il territorio di Big Mom, imperatrice che colleziona razze come figli e tiene un paese fatto di dolci. Sanji è convocato per un matrimonio combinato che serve a saldare un'alleanza fra due famiglie criminali, e la sua — i Vinsmoke — l'ha venduto. Qui si scopre da dove viene: da un padre che ha cercato di togliergli le emozioni prima che nascesse, e da una madre che l'ha impedito pagandolo con la vita. Rufy va a riprenderselo senza un piano e quasi ci muore. Non lo salva la forza: lo salvano una torta e la promessa di aspettarlo sotto la pioggia.",
        en: "Big Mom's territory: an emperor who collects races as children and rules a country made of sweets. Sanji is summoned to an arranged marriage meant to seal an alliance between two criminal families, and his own — the Vinsmokes — sold him. Here we learn where he comes from: a father who tried to strip his emotions away before he was born, and a mother who stopped it and paid with her life. Luffy goes to get him back without a plan and nearly dies for it. What saves him is not strength: it is a cake, and a promise to wait for him in the rain.",
        ja: "ビッグ・マムの領土。あらゆる種族を子として集め、菓子でできた国を治める皇帝の国だ。サンジは二つの犯罪一族の同盟を結ぶための政略結婚に呼び出される。彼の一族ヴィンスモークが彼を売ったのだ。ここで彼の出自が明かされる。生まれる前に感情を奪おうとした父と、それを阻んで命で償った母。ルフィは無計画に奪い返しに行き、死にかける。彼を救うのは力ではない。一つのケーキと、雨の中で待つという約束だ。",
        fr: "Le territoire de Big Mom : une impératrice qui collectionne les races comme des enfants et règne sur un pays fait de sucreries. Sanji est convoqué à un mariage arrangé destiné à sceller une alliance entre deux familles criminelles, et la sienne — les Vinsmoke — l'a vendu. On découvre ici d'où il vient : d'un père qui a tenté de lui retirer ses émotions avant sa naissance, et d'une mère qui l'a empêché et l'a payé de sa vie. Luffy va le reprendre sans plan et y laisse presque la vie. Ce qui le sauve n'est pas la force : c'est un gâteau, et la promesse de l'attendre sous la pluie.",
        es: "El territorio de Big Mom: una emperatriz que colecciona razas como hijos y gobierna un país hecho de dulces. Sanji es convocado a un matrimonio concertado que sirve para sellar una alianza entre dos familias criminales, y la suya — los Vinsmoke — lo ha vendido. Aquí se descubre de dónde viene: de un padre que intentó quitarle las emociones antes de nacer, y de una madre que lo impidió y lo pagó con la vida. Luffy va a recuperarlo sin un plan y casi muere. Lo que lo salva no es la fuerza: es una tarta y la promesa de esperarlo bajo la lluvia.",
        de: "Big Moms Gebiet: eine Kaiserin, die Völker wie Kinder sammelt und ein Land aus Süßigkeiten regiert. Sanji wird zu einer arrangierten Hochzeit gerufen, die ein Bündnis zwischen zwei Verbrecherfamilien besiegeln soll — und seine eigene, die Vinsmokes, hat ihn verkauft. Hier erfährt man, woher er kommt: von einem Vater, der ihm vor der Geburt die Gefühle nehmen wollte, und von einer Mutter, die es verhinderte und mit dem Leben bezahlte. Ruffy holt ihn ohne Plan zurück und stirbt dabei fast. Was ihn rettet, ist nicht Stärke: es ist eine Torte und das Versprechen, im Regen auf ihn zu warten."
      }
    },
    {
      key: "reverie", vol: [90, 90], cap: [903, 908],
      nome: { it: "Reverie", en: "Reverie", ja: "世界会議編",
              fr: "Reverie", es: "Reverie", de: "Reverie" },
      trama: {
        it: "Sei capitoli brevi ma decisivi: i re di cinquant'anni di alleanze si riuniscono nella capitale del mondo per il consiglio che si tiene ogni quattro anni. Vivi e i sovrani di Alabasta ci vanno, e fra i corridoi si incrociano vecchie conoscenze della ciurma. Sotto la superficie l'Armata rivoluzionaria attacca, un re chiede di parlare dei Draghi Celesti, e i cinque anziani del governo mondiale nominano per la prima volta qualcuno che siede più in alto di loro. È l'arco che smette di raccontare pirati e comincia a raccontare chi comanda il mondo.",
        en: "Six short but decisive chapters: the kings of fifty years of alliances gather in the world's capital for the council held every four years. Vivi and the rulers of Alabasta attend, and in the corridors old acquaintances of the crew cross paths. Beneath the surface the Revolutionary Army attacks, a king asks to speak about the Celestial Dragons, and the five elders of the World Government name, for the first time, someone who sits above them. This is the arc that stops being about pirates and starts being about who runs the world.",
        ja: "短いが決定的な六話。五十年の加盟国の王たちが、四年に一度の会議のため世界の首都に集まる。ビビとアラバスタの王家も出席し、廊下では一味の旧知の者たちが行き交う。その水面下で革命軍が動き、ある王が天竜人について話したいと申し出、世界政府の五老星が初めて、自分たちより上に座る存在の名を口にする。海賊の物語をやめ、誰が世界を動かしているのかを語り始める物語だ。",
        fr: "Six chapitres courts mais décisifs : les rois de cinquante ans d'alliances se réunissent dans la capitale du monde pour le conseil qui se tient tous les quatre ans. Vivi et les souverains d'Alabasta y vont, et dans les couloirs se croisent de vieilles connaissances de l'équipage. Sous la surface, l'Armée révolutionnaire attaque, un roi demande à parler des Dragons Célestes, et les cinq doyens du Gouvernement mondial nomment pour la première fois quelqu'un qui siège au-dessus d'eux. C'est l'arc qui cesse de parler de pirates et commence à parler de qui gouverne le monde.",
        es: "Seis capítulos cortos pero decisivos: los reyes de cincuenta años de alianzas se reúnen en la capital del mundo para el consejo que se celebra cada cuatro años. Vivi y los soberanos de Alabasta acuden, y en los pasillos se cruzan viejos conocidos de la tripulación. Bajo la superficie el Ejército Revolucionario ataca, un rey pide hablar de los Dragones Celestiales, y los cinco ancianos del Gobierno Mundial nombran por primera vez a alguien que se sienta por encima de ellos. Es el arco que deja de hablar de piratas y empieza a hablar de quién manda en el mundo.",
        de: "Sechs kurze, aber entscheidende Kapitel: die Könige aus fünfzig Jahren Bündnissen versammeln sich in der Hauptstadt der Welt zum Rat, der alle vier Jahre stattfindet. Vivi und die Herrscher von Alabasta reisen an, und in den Gängen begegnen sich alte Bekannte der Crew. Unter der Oberfläche greift die Revolutionsarmee an, ein König bittet darum, über die Himmelsdrachen zu sprechen, und die fünf Ältesten der Weltregierung nennen erstmals jemanden, der über ihnen sitzt. Es ist der Bogen, der aufhört, von Piraten zu erzählen, und beginnt zu erzählen, wer die Welt regiert."
      }
    },
    {
      key: "wano", vol: [90, 105], cap: [909, 1057],
      nome: { it: "Paese di Wa", en: "Wano Country", ja: "ワノ国編",
              fr: "Pays des Wa", es: "País de Wano", de: "Wano-Land" },
      trama: {
        it: "L'arco più lungo della serie. Il Paese di Wa è una terra di samurai chiusa al mondo, tenuta da vent'anni sotto lo shogun Orochi e da Kaido, l'imperatore che nessuno è mai riuscito a uccidere — ci hanno provato in molti, e lui ci ha provato da solo. Il paese è avvelenato dalle fabbriche, i fiumi non danno più acqua potabile, e la gente ha dimenticato di essere stata felice. Nove samurai hanno aspettato vent'anni l'ora di un'alleanza scritta su un patto, e l'alleanza arriva: pirati, Mink e samurai assaltano insieme l'isola-fortezza di Onigashima. Qui Rufy capisce che cos'è davvero il suo potere.",
        en: "The longest arc in the series. Wano is a land of samurai closed off from the world, held for twenty years by the shogun Orochi and by Kaido, the emperor nobody has ever managed to kill — many have tried, and so has he, on himself. The country is poisoned by factories, its rivers no longer give drinkable water, and its people have forgotten they were once happy. Nine samurai waited twenty years for the hour written on a pact, and the alliance comes: pirates, Minks and samurai storm the fortress-island of Onigashima together. Here Luffy understands what his power actually is.",
        ja: "シリーズ最長の物語。ワノ国は世界に門を閉ざした侍の国で、二十年にわたり将軍オロチと、誰も殺すことのできなかった皇帝カイドウに支配されてきた。多くの者が試み、彼自身も自らに試みた。国は工場に毒され、川の水は飲めなくなり、人々は幸せだった記憶を失っている。九人の侍は、盟約に記された刻を二十年待った。そして同盟は成る。海賊、ミンク族、侍が共に要塞の島・鬼ヶ島へ攻め込む。ここでルフィは、自分の力が本当は何であるかを知る。",
        fr: "L'arc le plus long de la série. Le Pays des Wa est une terre de samouraïs fermée au monde, tenue depuis vingt ans par le shogun Orochi et par Kaido, l'empereur que personne n'a jamais réussi à tuer — beaucoup ont essayé, et lui-même aussi, sur lui. Le pays est empoisonné par les usines, ses rivières ne donnent plus d'eau potable, et son peuple a oublié avoir été heureux. Neuf samouraïs ont attendu vingt ans l'heure inscrite sur un pacte, et l'alliance arrive : pirates, Minks et samouraïs prennent ensemble d'assaut l'île-forteresse d'Onigashima. C'est là que Luffy comprend ce qu'est vraiment son pouvoir.",
        es: "El arco más largo de la serie. El País de Wano es una tierra de samuráis cerrada al mundo, dominada durante veinte años por el shogun Orochi y por Kaido, el emperador al que nadie ha logrado matar nunca — muchos lo han intentado, y él mismo también, consigo. El país está envenenado por las fábricas, sus ríos ya no dan agua potable y su gente ha olvidado que fue feliz. Nueve samuráis esperaron veinte años la hora escrita en un pacto, y la alianza llega: piratas, mink y samuráis asaltan juntos la isla-fortaleza de Onigashima. Aquí Luffy entiende qué es realmente su poder.",
        de: "Der längste Bogen der Serie. Wano ist ein der Welt verschlossenes Samurailand, seit zwanzig Jahren beherrscht vom Shogun Orochi und von Kaido, dem Kaiser, den niemand je töten konnte — viele haben es versucht, und er selbst an sich auch. Das Land ist von Fabriken vergiftet, seine Flüsse geben kein trinkbares Wasser mehr, und seine Menschen haben vergessen, dass sie einmal glücklich waren. Neun Samurai warteten zwanzig Jahre auf die in einem Pakt festgehaltene Stunde, und das Bündnis kommt: Piraten, Minks und Samurai stürmen gemeinsam die Festungsinsel Onigashima. Hier versteht Ruffy, was seine Kraft wirklich ist."
      }
    },
    {
      key: "egghead", vol: [105, 111], cap: [1058, 1126],
      nome: { it: "Egghead", en: "Egghead", ja: "エッグヘッド編",
              fr: "Egghead", es: "Egghead", de: "Egghead" },
      trama: {
        it: "L'isola-laboratorio del dottor Vegapunk, il più grande scienziato del mondo, che vive in sei corpi perché uno non gli bastava. Qui la ciurma trova tecnologia di cento anni avanti, cloni dei corsari usati come armi, e la ragione per cui il governo mondiale vuole Vegapunk morto: ha scoperto qualcosa sul Secolo Vuoto, i cento anni cancellati dalla storia. I cinque anziani arrivano di persona, e per la prima volta si vede cosa sono. L'arco finisce con un messaggio trasmesso al mondo intero, che nessun governo riesce a fermare.",
        en: "Doctor Vegapunk's laboratory island — the world's greatest scientist, who lives in six bodies because one was not enough. Here the crew find technology a century ahead, clones of the warlords used as weapons, and the reason the World Government wants Vegapunk dead: he found out something about the Void Century, the hundred years erased from history. The five elders arrive in person, and for the first time we see what they are. The arc ends with a message broadcast to the whole world that no government manages to stop.",
        ja: "世界最高の科学者ベガパンク博士の研究所の島。一つでは足りぬと、六つの体に分かれて生きる男だ。ここで一味は百年先の技術と、兵器として使われる七武海のクローン、そして世界政府がベガパンクの死を望む理由を知る。彼は歴史から消された百年、空白の百年について何かを掴んでいた。五老星が自ら現れ、その正体が初めて明かされる。物語は、どの政府にも止められぬまま全世界へ流れる一つの放送で終わる。",
        fr: "L'île-laboratoire du docteur Vegapunk, le plus grand savant du monde, qui vit dans six corps parce qu'un seul ne lui suffisait pas. L'équipage y trouve une technologie en avance d'un siècle, des clones des corsaires utilisés comme armes, et la raison pour laquelle le Gouvernement mondial veut la mort de Vegapunk : il a découvert quelque chose sur le Siècle oublié, les cent ans effacés de l'histoire. Les cinq doyens arrivent en personne, et l'on voit pour la première fois ce qu'ils sont. L'arc se termine sur un message diffusé au monde entier qu'aucun gouvernement ne parvient à arrêter.",
        es: "La isla-laboratorio del doctor Vegapunk, el mayor científico del mundo, que vive en seis cuerpos porque uno no le bastaba. Allí la tripulación encuentra tecnología cien años adelantada, clones de los guerreros del mar usados como armas, y la razón por la que el Gobierno Mundial quiere a Vegapunk muerto: ha descubierto algo sobre el Siglo Vacío, los cien años borrados de la historia. Los cinco ancianos llegan en persona, y por primera vez se ve qué son. El arco termina con un mensaje transmitido al mundo entero que ningún gobierno consigue detener.",
        de: "Die Laborinsel von Dr. Vegapunk, dem größten Wissenschaftler der Welt, der in sechs Körpern lebt, weil einer ihm nicht genügte. Hier findet die Crew Technik, die ein Jahrhundert voraus ist, Klone der Samurai der Meere, die als Waffen dienen, und den Grund, warum die Weltregierung Vegapunk tot sehen will: er hat etwas über das Leere Jahrhundert herausgefunden, die hundert aus der Geschichte getilgten Jahre. Die fünf Ältesten erscheinen persönlich, und zum ersten Mal sieht man, was sie sind. Der Bogen endet mit einer Botschaft an die ganze Welt, die keine Regierung aufhalten kann."
      }
    },
    {
      key: "elbaf", vol: [111, 0], cap: [1127, 0],
      nome: { it: "Erbaf", en: "Elbaf", ja: "エルバフ編",
              fr: "Elbaf", es: "Elbaf", de: "Elbaf" },
      trama: {
        it: "L'arco in corso, e l'ultimo grande approdo prima della fine annunciata della serie. Erbaf è il paese dei giganti, nominato per la prima volta centinaia di capitoli prima: la terra dei guerrieri di cui Usopp parla da quando è un bambino, e dove due giganti incontrati a Little Garden hanno giurato di tornare. Qui la storia comincia a chiudere i conti aperti dal principio — il Secolo Vuoto, i Poignee Griffe, il perché il governo mondiale ha cancellato cento anni. Essendo in corso, di questo arco non si può ancora dire come finisce.",
        en: "The ongoing arc, and the last great landfall before the series' announced ending. Elbaf is the land of the giants, first named hundreds of chapters earlier: the country of warriors Usopp has talked about since he was a child, and where two giants met at Little Garden swore they would return. Here the story begins settling the accounts opened at the very start — the Void Century, the Poneglyphs, why the World Government erased a hundred years. Being ongoing, how this arc ends cannot yet be told.",
        ja: "現在進行中の物語であり、完結が予告されたシリーズの最後の大きな上陸地だ。エルバフは巨人族の国。何百話も前に初めてその名が出た、ウソップが子供の頃から語ってきた戦士たちの土地であり、リトルガーデンで出会った二人の巨人が帰ると誓った場所でもある。ここから物語は、最初に開いた勘定を閉じ始める。空白の百年、ポーネグリフ、そして世界政府が百年を消した理由。進行中であるため、この物語がどう終わるかはまだ語れない。",
        fr: "L'arc en cours, et la dernière grande escale avant la fin annoncée de la série. Elbaf est le pays des géants, nommé pour la première fois des centaines de chapitres plus tôt : la terre des guerriers dont Usopp parle depuis l'enfance, et où deux géants rencontrés à Little Garden ont juré de revenir. Ici l'histoire commence à solder les comptes ouverts au tout début — le Siècle oublié, les Ponéglyphes, la raison pour laquelle le Gouvernement mondial a effacé cent ans. L'arc étant en cours, on ne peut pas encore dire comment il finit.",
        es: "El arco en curso, y la última gran escala antes del final anunciado de la serie. Elbaf es el país de los gigantes, nombrado por primera vez cientos de capítulos antes: la tierra de los guerreros de la que Usopp habla desde niño, y a la que dos gigantes conocidos en Little Garden juraron volver. Aquí la historia empieza a saldar las cuentas abiertas al principio — el Siglo Vacío, los poneglyphs, por qué el Gobierno Mundial borró cien años. Al estar en curso, de este arco todavía no se puede decir cómo termina.",
        de: "Der laufende Bogen und die letzte große Landung vor dem angekündigten Ende der Serie. Elbaf ist das Land der Riesen, Hunderte Kapitel früher erstmals genannt: das Land der Krieger, von dem Lysop seit seiner Kindheit spricht, und wohin zwei in Little Garden getroffene Riesen zurückzukehren schworen. Hier beginnt die Geschichte, die von Anfang an offenen Rechnungen zu schließen — das Leere Jahrhundert, die Poneglyphen, warum die Weltregierung hundert Jahre getilgt hat. Da der Bogen läuft, lässt sich noch nicht sagen, wie er endet."
      }
    }
  ];

  /**
   * I 115 volumi, dal primo all'ultimo uscito.
   *
   * Ogni riga è [numero, titolo italiano, titolo giapponese, romaji, primo
   * capitolo, ultimo capitolo, indice dell'arco in ARCHI]. I titoli italiani
   * sono quelli dell'edizione Star Comics, i giapponesi quelli Shūeisha.
   */
  const VOLUMI = [
    [1, "Romance Dawn, l'alba di una grande avventura", "ROMANCE DAWN —冒険の夜明け", "Romance Dawn - Bōken no yoake", 1, 8, 0],
    [2, "Versus! La banda del pirata Bagy", "VERSUS!! バギー海賊団", "VERSUS!! Bagī kaizoku-dan", 9, 17, 0],
    [3, "Un tipino a modo", "偽れぬもの", "Itsuwarenu mono", 18, 26, 0],
    [4, "Falce di luna", "三日月", "Mikazuki", 27, 35, 0],
    [5, "Per chi suona la campana", "誰が為に鐘は鳴る", "Dare ga tame ni kane wa naru", 36, 44, 0],
    [6, "Giuramento", "誓い", "Chikai", 45, 53, 0],
    [7, "Vecchiaccio", "クソジジイ", "Kuso jijī", 54, 62, 0],
    [8, "Non morirò", "死なねェよ", "Shinanē yo", 63, 71, 0],
    [9, "Lacrime", "涙", "Namida", 72, 81, 0],
    [10, "OK, Let's STAND UP!", "OK, Let's STAND UP!", "", 82, 90, 0],
    [11, "Il più cattivo dei mari orientali", "東一番の悪", "Higashi ichiban no waru", 91, 99, 0],
    [12, "La leggenda ha inizio", "伝説は始まった", "Densetsu wa hajimatta", 100, 108, 1],
    [13, "Tutto bene!", "大丈夫!!!", "Daijōbu!!!", 109, 117, 1],
    [14, "Istinto", "本能", "Honnō", 118, 126, 1],
    [15, "Avanti sempre e comunque!", "まっすぐ!!!", "Massugu!!!", 127, 136, 1],
    [16, "La volontà ereditata", "受け継がれる意志", "Uketugareru ishi", 137, 145, 1],
    [17, "I ciliegi di Hillk", "ヒルルクの桜", "Hiruruku no sakura", 146, 155, 1],
    [18, "Entra in scena Ace!", "エース登場", "Ēsu tōjō", 156, 166, 1],
    [19, "L'onda della rivolta", "反乱", "Uneri", 167, 176, 1],
    [20, "Battaglia decisiva in Alubarna!", "決戦はアルバーナ", "Kessen wa Arubāna", 177, 186, 1],
    [21, "Utopia!", "理想郷", "Risōkyō", 187, 195, 1],
    [22, "Hope!", "HOPE!!", "", 196, 205, 1],
    [23, "La grande avventura di Bibi", "ビビの冒険", "Bibi no bōken", 206, 216, 1],
    [24, "I sogni delle persone", "人の夢", "Hito no yume", 217, 226, 2],
    [25, "L'uomo da cento milioni di berry", "一億の男", "Ichioku no otoko", 227, 236, 2],
    [26, "Avventura nell'isola degli Dei", "神の島の冒険", "Kami no shima no bōken", 237, 246, 2],
    [27, "Ouverture", "序曲", "Ōbāchua", 247, 255, 2],
    [28, "Wiper, demonio combattente", "「戦鬼」ワイパー", "\"Senki\" Waipā", 256, 264, 2],
    [29, "Oratorio", "聖譚曲", "Oratorio", 265, 275, 2],
    [30, "Capriccio", "狂想曲", "Kapuritchio", 276, 285, 2],
    [31, "Saremo sempre qui!", "ここにいる", "Koko ni iru", 286, 295, 2],
    [32, "Canto d'amore", "島の歌声", "Rabu songu", 296, 305, 2],
    [33, "Davy Back Fight!", "DAVY BACK FIGHT!!", "", 306, 316, 3],
    [34, "Water Seven, la metropoli dell'acqua", "「水の都」ウォーターセブン", "\"Mizu no miyako\" Wōtā Sebun", 317, 327, 4],
    [35, "Capitano", "船長", "Kyaputen", 328, 336, 4],
    [36, "La nona giustizia", "9番目の正義", "Kyūbanme no seigi", 337, 346, 4],
    [37, "Tom", "トムさん", "Tomu-san", 347, 357, 4],
    [38, "Rocket Man!!", "ロケットマン!!", "Roketto Man!!", 358, 367, 4],
    [39, "Lotta", "争奪戦", "Sōdatsusen", 368, 377, 4],
    [40, "Gear", "ギア", "Gia", 378, 388, 5],
    [41, "Dichiarazione di guerra", "宣戦布告", "Sensen fukoku", 389, 399, 5],
    [42, "Pirati contro Cp9", "海賊 VS CP9", "Kaizoku VS CP9", 400, 409, 5],
    [43, "La leggenda dell'eroe", "英雄伝説", "Eiyū densetsu", 410, 419, 5],
    [44, "Ripartiamo!", "帰ろう", "Kaerō", 420, 430, 5],
    [45, "Capiamo ciò che provate...", "心中お察しする", "Shinchū osasshi suru", 431, 440, 5],
    [46, "Avventura nell'isola fantasma", "ゴースト島の冒険", "Gōsuto Airando no bōken", 441, 449, 6],
    [47, "Tempo coperto con probabili precipitazioni d'ossa", "くもり時々ホネ", "Kumori tokidoki hone", 450, 459, 6],
    [48, "Le avventure di Odr", "オーズの冒険", "Ōzu no Bōken", 460, 470, 6],
    [49, "Nightmare Rufy", "ナイトメア・ルフィ", "Naitomea Rufi", 471, 481, 6],
    [50, "La raggiungeremo di nuovo", "再び辿りつく", "Futatabi tadoritsuku", 482, 491, 6],
    [51, "Le undici supernove", "11人の超新星", "Jūichinin no chōchinsei", 492, 502, 7],
    [52, "Roger e Rayleigh", "ロジャーとレイリー", "Rojā to Reirī", 503, 512, 7],
    [53, "La natura di un re", "王の資質", "Ō no shishitsu", 513, 522, 8],
    [54, "Ormai nessuno può più fermarlo", "もう誰にも止められない", "Mō dare ni mo tomerarenai", 523, 532, 9],
    [55, "Un gay all'inferno", "地獄に", "Jigoku ni okama", 533, 541, 9],
    [56, "Grazie", "ありがとう", "Arigatō", 542, 551, 9],
    [57, "In lotta per la vetta", "頂上決戦", "Chōjō kessen", 552, 562, 10],
    [58, "Il nome di quest'epoca è \"Barbabianca\"", "この時代の名を\"白ひげ\"と呼ぶ", "Kono jidai no na o \"Shirohige\" to yobu", 563, 573, 10],
    [59, "La morte di Portuguese D. Ace", "ポートガス・Ｄ・エース死す", "Pōtogasu Dī Ēsu shisu", 574, 584, 10],
    [60, "Fratellino mio", "弟よ", "Otōto yo", 585, 594, 10],
    [61, "Romance dawn for the new world - L'alba di una nuova avventura nel nuovo mondo", "ROMANCE DAWN for the New World —新しい世界への冒険の夜明け—", "ROMANCE DAWN for the New World - Atarashī Sekai e no bōken no yoake", 595, 603, 11],
    [62, "Avventura sull'isola degli uomini-pesce", "魚人島の冒険", "Gyojintō no bōken", 604, 614, 11],
    [63, "Otohime e Tiger", "オトヒメとタイガー", "Otohime to Taigā", 615, 626, 11],
    [64, "Centomila VS. dieci", "10万VS10", "Jūman bāsasu jū", 627, 636, 11],
    [65, "Da zero", "ゼロに", "Zero ni", 637, 646, 11],
    [66, "La strada che portava al Sole", "タイヨウへと続く道", "Taiyō e to tsuzuku michi", 647, 656, 11],
    [67, "Cool Fight", "クール ファィト", "COOL FIGHT", 657, 667, 12],
    [68, "Alleanza pirata", "海賊同盟", "Kaizoku dōmei", 668, 678, 12],
    [69, "S.A.D.", "SAD", "SAD", 679, 690, 12],
    [70, "Arriva Do Flamingo", "ドフラミンゴ現る", "Dofuramingo arawaru", 691, 700, 12],
    [71, "Un colosseo di canaglie", "曲者達のコロシアム", "Kusemono-tachi no koroshiamu", 701, 711, 13],
    [72, "I dimenticati di Dressrosa", "ドレスローザの忘れ物", "Doresurōza no wasuremono", 712, 721, 13],
    [73, "Operazione Dressrosa O.S.S.", "ドレスローザSOP作戦", "Doresurōza esu-ō-pī sakusen", 722, 731, 13],
    [74, "Ti starò sempre vicino", "いつでもキミのそばにいる", "Itsudemo kimi no soba ni iru", 732, 742, 13],
    [75, "Ringraziamento", "おれの恩返し", "Ore no ongaeshi", 743, 752, 13],
    [76, "Non badarci e avanza", "構わず進め", "Kamawazu susume", 753, 763, 13],
    [77, "Smile", "スマイル", "Sumairu", 764, 775, 13],
    [78, "Il carisma del male", "悪のカリスマ", "Aku no karisuma", 776, 785, 13],
    [79, "Lucy!", "ルーシー!!", "LUCY!!", 786, 795, 13],
    [80, "Si alza il sipario", "開幕宣言", "Kaimaku sengen", 796, 806, 13],
    [81, "Andiamo ad incontrare il potente Gatto-vipera", "ネコマムシの旦那に会いに行こう", "Nekomamushi no danna ni ai ni ikō", 807, 816, 14],
    [82, "Un mondo inquieto", "ざわつく世界", "Zawatsuku sekai", 817, 827, 14],
    [83, "L'imperatrice pirata Charlotte Linlin", "海賊「四皇」シャーロット・リンリン", "Kaizoku 'Yonkō' Shārotto Rinrin", 828, 838, 15],
    [84, "Rufy contro Sanji", "ルフィVSサンジ", "Rufi VS Sanji", 839, 848, 15],
    [85, "Bugiardo", "ウソつき", "Usotsuki", 849, 858, 15],
    [86, "Il piano per assassinare l'imperatrice", "四皇暗殺作戦", "Yonkō ansatsu sakusen", 859, 869, 15],
    [87, "Non è dolce", "甘くない", "Amakunai", 870, 879, 15],
    [88, "Leone", "獅子", "Shishi", 880, 889, 15],
    [89, "Bad End Musical", "BADEND MUSICAL", "", 890, 900, 15],
    [90, "Il Santuario di Marijoa", "聖地マリージョア", "Seichi Marījoa", 901, 910, 16],
    [91, "Avventura nel paese dei samurai", "侍の国の冒険", "Samurai no kuni no bōken", 911, 921, 17],
    [92, "Entra in scena la cortigiana Komurasaki", "花魁小紫登場", "Oiran Komurasaki tōjō", 922, 931, 17],
    [93, "Il più amato del quartiere di Ebisu", "えびす町の人気者", "Ebisu-chō no ninkimono", 932, 942, 17],
    [94, "Il sogno dei soldati più forti", "兵どもが夢", "Tsuwamono-domo ga yume", 943, 953, 17],
    [95, "L'avventura di Oden", "おでんの冒険", "Oden no bōken", 954, 964, 17],
    [96, "L'oden dev'essere ardente", "煮えてなんぼのおでんに候", "Niete nanbo no Oden ni sōrō", 965, 974, 17],
    [97, "La mia bibbia", "僕の聖書", "Boku no baiburu", 975, 984, 17],
    [98, "Kin, il broccato dei fedeli vassalli", "忠臣錦", "Chūshin nishiki", 985, 994, 17],
    [99, "Rufy dal Cappello di Paglia", "麦わらのルフィ", "Mugiwara no Rufi", 995, 1004, 17],
    [100, "Modalità Re Conquistatore", "覇王色", "Haōshoku", 1005, 1015, 17],
    [101, "Entrano in scena le stelle", "花形登場", "Hanagata tōjō", 1016, 1025, 17],
    [102, "Punto di svolta", "天王山", "Tennōzan", 1026, 1035, 17],
    [103, "Il guerriero della liberazione", "解放の戦士", "Kaihō no senshi", 1036, 1046, 17],
    [104, "Kozuki Momonosuke, shogun del Paese di Wa", "ワノ国将軍光月モモの助", "Wano Kuni shōgun Kōzuki Momonosuke", 1047, 1055, 17],
    [105, "Il sogno di Rufy", "ルフィの夢", "Rufi no yume", 1056, 1065, 18],
    [106, "Il sogno di un genio", "天才の夢", "Tensai no yume", 1066, 1076, 18],
    [107, "L'eroe leggendario", "伝説の英雄", "Densetsu no eiyū", 1077, 1088, 18],
    [108, "Un mondo in cui è meglio la morte", "死んだ方がいい世界", "Shinda hō ga ī sekai", 1089, 1100, 18],
    [109, "Dalla tua parte", "きみの味方", "Kimi no mikata", 1101, 1110, 18],
    [110, "Le oscillazioni di un'epoca", "時代のうねり", "Jidai no uneri", 1111, 1121, 18],
    [111, "Avventura a Erbaf", "エルバフの冒険", "Erubafu no bōken", 1122, 1133, 19],
    [112, "L'Harley", "", "Hārei", 1134, 1144, 19],
    [113, "La nascita di Loki", "ロキ誕生", "Roki tanjō", 1145, 1155, 19],
    [114, "L'incidente di God Valley", "ゴッドバレー事件", "Goddo Barē jiken", 1156, 1166, 19],
    [115, "La cosa più forte del mondo", "せかいで１つよいもの", "Sekai de ichiban tsuyoi mono", 1167, 1179, 19]
  ];

  /**
   * Dove si legge One Piece per davvero, e legalmente.
   *
   * Il manga è di Eiichirō Oda e della Shūeisha, e non esiste in nessuna
   * fonte libera: per questo il lettore interno dell'app — che apre le opere
   * di dominio pubblico — qui non può fare niente. Ma il suo editore lo
   * pubblica gratis in parte, e le prime tre e le ultime tre puntate si
   * leggono senza pagare né registrarsi.
   *
   * Sono elencati solo canali ufficiali. I siti che caricano scansioni non
   * autorizzate non stanno qui, e non ci staranno: pagare Oda è il motivo per
   * cui One Piece esiste ancora.
   */
  const DOVE = [
    {
      nome: "MANGA Plus (Shūeisha)",
      url: "https://mangaplus.shueisha.co.jp/titles/100020",
      lingue: ["en", "es", "fr", "de"],
      nota: {
        it: "L'editore giapponese di One Piece. I primi tre e gli ultimi tre capitoli sono gratis, senza registrazione, il giorno stesso dell'uscita in Giappone.",
        en: "One Piece's own Japanese publisher. The first three and latest three chapters are free, no account needed, the same day they come out in Japan.",
        ja: "One Piece の日本の出版社による公式配信。最初の三話と最新の三話は、登録なしで日本と同時に無料で読める。",
        fr: "L'éditeur japonais de One Piece. Les trois premiers et les trois derniers chapitres sont gratuits, sans compte, le jour même de la sortie au Japon.",
        es: "La editorial japonesa de One Piece. Los tres primeros y los tres últimos capítulos son gratis, sin registro, el mismo día que salen en Japón.",
        de: "Der japanische Verlag von One Piece. Die ersten drei und die neuesten drei Kapitel sind kostenlos, ohne Konto, am Tag der Veröffentlichung in Japan."
      }
    },
    {
      nome: "Viz — Shonen Jump",
      url: "https://www.viz.com/shonenjump/chapters/one-piece",
      lingue: ["en"],
      nota: {
        it: "L'editore americano. Capitoli gratuiti e, con un abbonamento, l'intera serie in inglese.",
        en: "The US publisher. Free chapters, and the whole series in English with a subscription.",
        ja: "アメリカの出版社。無料話と、購読すれば英語版の全話。",
        fr: "L'éditeur américain. Chapitres gratuits et, avec un abonnement, la série entière en anglais.",
        es: "La editorial estadounidense. Capítulos gratis y, con suscripción, la serie completa en inglés.",
        de: "Der US-Verlag. Kostenlose Kapitel und mit Abo die ganze Serie auf Englisch."
      }
    },
    {
      nome: "Star Comics",
      url: "https://www.starcomics.com/serie/one-piece",
      lingue: ["it"],
      nota: {
        it: "L'edizione italiana su carta, dal 2001. I titoli dei volumi elencati qui sono i suoi.",
        en: "The Italian print edition, since 2001. The volume titles listed here are theirs.",
        ja: "2001年から続くイタリア語版（紙）。ここに並ぶ巻タイトルはこの版のもの。",
        fr: "L'édition italienne papier, depuis 2001. Les titres de volumes listés ici sont les siens.",
        es: "La edición italiana en papel, desde 2001. Los títulos de los volúmenes aquí listados son los suyos.",
        de: "Die italienische Printausgabe seit 2001. Die hier aufgeführten Bandtitel stammen von ihr."
      }
    }
  ];

  /* ==================================================== per cercare ====== */

  const normalizza = (s) => String(s || "")
    .toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  /** Se la ricerca sta chiedendo One Piece. */
  function riguardaOnePiece(query) {
    const q = normalizza(query);
    if (!q) return false;
    return /\bone piece\b/.test(q) || /\bonepiece\b/.test(q) ||
      /\boda\b/.test(q) && /\beiichir/.test(q) || q === "rufy" || q === "luffy";
  }

  const lingueValide = new Set(LINGUE.map((l) => l.code));
  const conLingua = (lingua) => (lingueValide.has(lingua) ? lingua : "it");

  /** L'arco a cui appartiene un volume. */
  const arcoDelVolume = (volume) => ARCHI[volume[6]] || null;

  /** I volumi di un arco. */
  const volumiDellArco = (key) => {
    const i = ARCHI.findIndex((a) => a.key === key);
    return i < 0 ? [] : VOLUMI.filter((v) => v[6] === i);
  };

  /**
   * I volumi come libri, per farli comparire nella libreria insieme a tutto
   * il resto. La trama è quella dell'arco: è il livello a cui la storia ha un
   * senso, e ogni scheda dice quali capitoli contiene.
   */
  function comeLibri(lingua = "it") {
    const l = conLingua(lingua);
    return VOLUMI.map((v) => {
      const arco = arcoDelVolume(v);
      return {
        id: "onepiece:" + v[0],
        source: "onepiece",
        title: `One Piece ${v[0]} — ${v[1]}`,
        altTitle: v[2] ? `${v[2]} (${v[3]})` : "",
        author: "Eiichirō Oda",
        authorKeys: [],
        year: null,
        pages: null,
        cover: null,
        coverLarge: null,
        subjects: ["manga", "avventura", "shōnen"],
        languages: ["ita", "jpn"],
        editions: 0,
        publisher: "Star Comics",
        firstSentence: "",
        readable: false,
        freeUrl: "",
        volume: v[0],
        capitoli: [v[4], v[5]],
        arco: arco && arco.key,
        blurb: arco ? arco.trama[l] : ""
      };
    });
  }

  return {
    LINGUE, STORIA, ARCHI, VOLUMI, DOVE,
    riguardaOnePiece, arcoDelVolume, volumiDellArco, comeLibri, conLingua,
    quantiVolumi: () => VOLUMI.length,
    ultimoCapitolo: () => VOLUMI[VOLUMI.length - 1][5]
  };
})();
