-- Catálogo ampliado de juegos y juego personalizado en el tablón.
-- Ejecutar una sola vez en Supabase → SQL Editor. Se puede repetir sin duplicar juegos.
begin;

-- 1) Las publicaciones del tablón pueden usar un juego del catálogo (game_id)
--    o un nombre escrito por la persona (custom_game_name), nunca los dos.
alter table public.projects
  add column if not exists custom_game_name varchar(120)
    check (custom_game_name is null or length(btrim(custom_game_name)) > 0);

alter table public.projects
  drop constraint if exists projects_single_game_source;
alter table public.projects
  add constraint projects_single_game_source
    check (game_id is null or custom_game_name is null);

-- 2) Juegos del catálogo. cover_path acepta una ruta del bucket game-covers
--    o una URL https completa (fotos de Wikimedia Commons / Unsplash).
create temporary table catalog_seed (
  name varchar(160),
  description text,
  min_players smallint,
  max_players smallint,
  playing_time_minutes smallint,
  year_published smallint,
  publisher varchar(120),
  cover_path text,
  category text
) on commit drop;

insert into catalog_seed values
  ('Carcassonne', 'Colocación de losetas para dar forma a un mapa medieval y puntuar con tus seguidores.', 2, 5, 35, 2000, 'Hans im Glück', 'https://commons.wikimedia.org/wiki/Special:FilePath/Carcassonne_Miples.jpg?width=800', 'Estrategia familiar'),
  ('Aventureros al Tren (Ticket to Ride)', 'Un clásico accesible basado en conectar rutas ferroviarias por todo el mundo.', 2, 5, 60, 2004, 'Days of Wonder', 'https://commons.wikimedia.org/wiki/Special:FilePath/Ticket_to_Ride_Europe_in_Hattula.jpg?width=800', 'Estrategia familiar'),
  ('Azul', 'Estrategia abstracta y visualmente preciosa donde compites por revestir de mosaicos un palacio real.', 2, 4, 45, 2017, 'Plan B Games', 'https://commons.wikimedia.org/wiki/Special:FilePath/A_four-player_game_of_the_board_game_Azul.jpg?width=800', 'Estrategia familiar'),
  ('7 Wonders', 'Desarrollo de civilizaciones de ritmo ágil mediante el formato de drafteo (pasar manos de cartas).', 2, 7, 30, 2010, 'Repos Production', 'https://commons.wikimedia.org/wiki/Special:FilePath/7_Wonders_game.jpg?width=800', 'Estrategia familiar'),
  ('Agricola', 'Una experiencia desafiante de simulación de granjas donde alimentar a tu familia es todo un reto.', 1, 5, 120, 2007, 'Lookout Games', 'https://commons.wikimedia.org/wiki/Special:FilePath/Agricola_board_game.jpg?width=800', 'Estrategia familiar'),
  ('Puerto Rico', 'Un clásico de roles variables donde gestionas plantaciones y exportas mercancías al Viejo Mundo.', 2, 5, 90, 2002, 'Alea', 'https://images.unsplash.com/photo-1763875067516-e947790c74ac?auto=format&fit=crop&w=800&q=70', 'Estrategia familiar'),
  ('Wingspan', 'Un fenómeno moderno bellamente ilustrado basado en crear hábitats ideales para atraer aves.', 1, 5, 60, 2019, 'Stonemaier Games', 'https://commons.wikimedia.org/wiki/Special:FilePath/Components_in_Wingspan_board_game.jpg?width=800', 'Estrategia familiar'),
  ('Castles of Burgundy', 'Puntuación y dados optimizados para construir el principado más próspero en la Francia medieval.', 2, 4, 90, 2011, 'Alea', 'https://commons.wikimedia.org/wiki/Special:FilePath/Castles_of_Burgundy_%28Board_Game%29.jpg?width=800', 'Estrategia familiar'),
  ('Pandemic', 'Trabajo en equipo a contrarreloj para frenar brotes globales y descubrir la cura de cuatro virus.', 2, 4, 45, 2008, 'Z-Man Games', 'https://commons.wikimedia.org/wiki/Special:FilePath/Pandemic_board_game.jpg?width=800', 'Cooperativo'),
  ('Virus!', 'La opción de cartas ultrarrápida y adictiva más famosa para contagiar órganos o salvar tu cuerpo.', 2, 6, 20, 2015, 'Tranjis Games', 'https://images.unsplash.com/photo-1762068383426-2e4389df451c?auto=format&fit=crop&w=800&q=70', 'Rápido y party'),
  ('Hanabi', 'Juego de deducción pura donde juegas a ciegas y tus compañeros te guían para lanzar fuegos artificiales.', 2, 5, 25, 2010, 'Abacus Spiele', 'https://commons.wikimedia.org/wiki/Special:FilePath/Hanabi_card_game_materials.jpg?width=800', 'Cooperativo'),
  ('The Mind', 'Un curioso experimento social donde el grupo alinea números de menor a mayor sin hablar ni hacerse señas.', 2, 4, 20, 2018, 'NSV', 'https://images.unsplash.com/photo-1761716475708-ef98183ccb62?auto=format&fit=crop&w=800&q=70', 'Cooperativo'),
  ('La Isla Prohibida', 'Una carrera cooperativa para capturar tesoros sagrados antes de que la isla se hunda por completo.', 2, 4, 30, 2010, 'Gamewright', 'https://images.unsplash.com/photo-1629760946220-5693ee4c46ac?auto=format&fit=crop&w=800&q=70', 'Cooperativo'),
  ('Sky Team', 'Un aclamado e ingenioso juego cooperativo exclusivo para 2 jugadores donde deben aterrizar un avión de pasajeros.', 2, 2, 20, 2023, 'Scorpion Masqué', 'https://images.unsplash.com/photo-1763875018525-1d39fe1a4354?auto=format&fit=crop&w=800&q=70', 'Cooperativo'),
  ('Dixit', 'Cartas ilustradas de ensueño que activan la imaginación mediante acertijos poéticos o sutiles.', 3, 6, 30, 2008, 'Libellud', 'https://commons.wikimedia.org/wiki/Special:FilePath/Dixit_game_0001.jpg?width=800', 'Deducción y roles ocultos'),
  ('Código Secreto (Codenames)', 'Competición por equipos para contactar espías usando pistas de una sola palabra.', 2, 8, 15, 2015, 'Czech Games Edition', 'https://commons.wikimedia.org/wiki/Special:FilePath/Codenames_board_game.jpg?width=800', 'Deducción y roles ocultos'),
  ('Concept', 'Adivina palabras complejas guiándote solo por los iconos e indicadores visuales de un tablero central.', 4, 12, 40, 2013, 'Repos Production', 'https://images.unsplash.com/photo-1611996575749-79a3a250f948?auto=format&fit=crop&w=800&q=70', 'Deducción y roles ocultos'),
  ('Secret Hitler', 'Tensión política y faroleo donde una mayoría liberal intenta frenar a los fascistas ocultos.', 5, 10, 45, 2016, 'Goat, Wolf & Cabbage', 'https://images.unsplash.com/photo-1761716475708-ef98183ccb62?auto=format&fit=crop&w=800&q=70', 'Deducción y roles ocultos'),
  ('The Resistance / Avalon', 'Misiones secretas donde debes deducir quiénes en tu grupo son caballeros leales y quiénes traidores.', 5, 10, 30, 2009, 'Indie Boards & Cards', 'https://images.unsplash.com/photo-1762068383426-2e4389df451c?auto=format&fit=crop&w=800&q=70', 'Deducción y roles ocultos'),
  ('Munchkin', 'Un divertido juego de cartas satírico donde peleas contra monstruos y traicionas a tus amigos por tesoros.', 3, 6, 90, 2001, 'Steve Jackson Games', 'https://commons.wikimedia.org/wiki/Special:FilePath/Munchkin_game.JPG?width=800', 'Deducción y roles ocultos'),
  ('Brass: Birmingham', 'Considerado repetidamente el número 1 del mundo en webs especializadas; pura estrategia económica industrial.', 2, 4, 120, 2018, 'Roxley Games', 'https://images.unsplash.com/photo-1763875067516-e947790c74ac?auto=format&fit=crop&w=800&q=70', 'Estrategia avanzada'),
  ('Terraforming Mars', 'Gestión corporativa de proyectos de ciencia ficción para hacer habitable el planeta rojo.', 1, 5, 120, 2016, 'FryxGames', 'https://commons.wikimedia.org/wiki/Special:FilePath/Terraforming_Mars_med_tre_expansioner_01.jpg?width=800', 'Estrategia avanzada'),
  ('Scythe', 'Una ucronía de entreguerras con arte asombroso que mezcla control de áreas, producción y enormes mechs de combate.', 1, 5, 115, 2016, 'Stonemaier Games', 'https://images.unsplash.com/photo-1763875018525-1d39fe1a4354?auto=format&fit=crop&w=800&q=70', 'Estrategia avanzada'),
  ('Dune: Imperium', 'Tensión militar y política que fusiona magistralmente la colocación de trabajadores y la creación de mazos.', 1, 4, 120, 2020, 'Dire Wolf', 'https://images.unsplash.com/photo-1629760946220-5693ee4c46ac?auto=format&fit=crop&w=800&q=70', 'Estrategia avanzada'),
  ('Ark Nova', 'Planifica y diseña un zoológico moderno, gestionando proyectos de conservación científica global.', 1, 4, 150, 2021, 'Feuerland Spiele', 'https://images.unsplash.com/photo-1763875067516-e947790c74ac?auto=format&fit=crop&w=800&q=70', 'Estrategia avanzada'),
  ('Gloomhaven', 'El rey de las campañas extensas de rol táctico cooperativo dentro de un universo de fantasía oscura.', 1, 4, 120, 2017, 'Cephalofair Games', 'https://images.unsplash.com/photo-1763875018525-1d39fe1a4354?auto=format&fit=crop&w=800&q=70', 'Estrategia avanzada'),
  ('Jungle Speed', 'Reflejos puros a gran velocidad para atrapar el tótem central antes que nadie cuando las cartas coincidan.', 2, 10, 15, 1991, 'Asmodee', 'https://commons.wikimedia.org/wiki/Special:FilePath/Jungle_speed_6_igraca.JPG?width=800', 'Rápido y party'),
  ('Dobble (Spot It!)', 'Un juego de agudeza visual donde siempre hay exactamente un símbolo idéntico entre dos cartas cualesquiera.', 2, 8, 15, 2009, 'Asmodee', 'https://commons.wikimedia.org/wiki/Special:FilePath/Dobble_jeu.jpg?width=800', 'Rápido y party'),
  ('Sushi Go!', 'Un formato rápido de drafteo de cartas donde compites por armar los mejores platos de comida japonesa.', 2, 5, 15, 2013, 'Gamewright', 'https://images.unsplash.com/photo-1762068383426-2e4389df451c?auto=format&fit=crop&w=800&q=70', 'Rápido y party');

insert into public.games (
  name, description, min_players, max_players, playing_time_minutes,
  year_published, publisher, cover_path, metadata
)
select
  s.name, s.description, s.min_players, s.max_players, s.playing_time_minutes,
  s.year_published, s.publisher, s.cover_path,
  jsonb_build_object('category', s.category, 'seed', 'catalogo-2026-11')
from catalog_seed s
where not exists (
  select 1 from public.games g
  where lower(btrim(g.name)) = lower(btrim(s.name))
);

-- Si algún juego ya existía con ese nombre, solo se le completa la portada.
update public.games g
set cover_path = s.cover_path
from catalog_seed s
where lower(btrim(g.name)) = lower(btrim(s.name))
  and (g.cover_path is null or btrim(g.cover_path) = '');

commit;
