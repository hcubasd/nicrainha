% nicrainha.cls: slides for the nicrainha showcase. Each slide is one page of
% beamer's 16:9 size; the page shows its title in a strip at the top, which
% the showcase puts on glass, and its body on the bare background.
%
%   \documentclass{nicrainha}
%   \title{…} \author{…} \date{…}
%   \begin{document}
%   \maketitle
%   \begin{slide}{Title}
%     …
%   \end{slide}
%   \end{document}
%
% Everything else is LaTeX's article class, with amsmath, amssymb, booktabs,
% graphicx and color. Keep the strip's lengths in sync with the
% showcase's main.js.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{nicrainha}[2026/11/01 nicrainha slides]
\LoadClass[11pt]{article}
\RequirePackage[T1]{fontenc}
\RequirePackage{lmodern}
\RequirePackage{amsmath,amssymb,booktabs,graphicx,color}
\renewcommand\familydefault{\sfdefault}

% Beamer's 16:9 page, 160 × 90 mm.
\setlength\paperwidth{160mm}
\setlength\paperheight{90mm}
\setlength\pdfpagewidth{\paperwidth}
\setlength\pdfpageheight{\paperheight}

% The margins, chosen by eye, and the title strip. A slide's title starts at
% the margins: its capitals' tops a margin below the page's top, as its first
% letter is a margin from the left, and a margin of strip lies below its
% baseline. The showcase's glass sits half a margin from the page's edges and
% half a margin from the capitals; descenders hang into the half margin below.
% The class logs the capitals' height and the descenders' depth for it:
% "nicrainha: title caps <height> descent <depth>". They're measured as the
% document begins, in whatever font the deck's preamble chose, and the strip
% and text height follow.
\newlength\nicrainha@margin \setlength\nicrainha@margin{8mm}
\def\nicrainha@titlefont{\large\bfseries}
\newlength\nicrainha@cap
\newlength\nicrainha@descent
\newlength\nicrainha@strip
\AddToHook{begindocument/before}{%
  \setbox\z@\hbox{\normalfont\nicrainha@titlefont
    \global\nicrainha@cap\fontcharht\font`H
    \global\nicrainha@descent\fontchardp\font`g}%
  \wlog{nicrainha: title caps \the\nicrainha@cap\space
    descent \the\nicrainha@descent}%
  \setlength\nicrainha@strip{\dimexpr\nicrainha@cap+2\nicrainha@margin\relax}%
  \setlength\headheight{\nicrainha@strip}%
  \setlength\textheight{\dimexpr\paperheight-\nicrainha@strip-\nicrainha@margin}}
\setlength\hoffset{-1in}
\setlength\voffset{-1in}
\setlength\oddsidemargin{\nicrainha@margin}
\setlength\evensidemargin{\nicrainha@margin}
\setlength\textwidth{\dimexpr\paperwidth-2\nicrainha@margin}
\setlength\topmargin{0pt}
\setlength\headsep{0pt}
\setlength\footskip{0pt}
\setlength\parindent{0pt}
\setlength\parskip{0.5\baselineskip}

% The ink: the color of everything not on glass. The showcase writes
% nicrainha-ink.tex, \def\nicrainha@ink{white} where white has more contrast
% on its background than black; without it, the ink is black. Text on glass
% is always black, the most contrast at nicrainha's default lightness. The
% ink is the document's default color, which LaTeX's \normalcolor restores.
\def\nicrainha@ink{black}
\InputIfFileExists{nicrainha-ink.tex}{}{}
\AtBeginDocument{\color{\nicrainha@ink}\let\default@color\current@color}

% The slide's title, its capitals' tops a margin below the page's top.
\def\nicrainha@title{}
\def\ps@nicrainha{%
  \def\@oddhead{\color{black}\vbox to\headheight{\kern\nicrainha@margin
    \hbox to\textwidth{\nicrainha@titlefont
      \vrule height\nicrainha@cap depth\z@ width\z@
      \smash{\nicrainha@title}\hfil}%
    \vss}}%
  \let\@evenhead\@oddhead
  \def\@oddfoot{}%
  \let\@evenfoot\@oddfoot}
\pagestyle{nicrainha}

% Each page's glass, written to the log for the showcase as
% "nicrainha: page <n> has a <title banner|title card>".
\def\nicrainha@glass#1{%
  \wlog{nicrainha: page \the\numexpr\ReadonlyShipoutCounter+1\relax\space has a #1}}

% A slide is one page. Its body is boxed to the text height, centered, so a
% body that doesn't fit is TeX's own overfull \vbox, never a second page.
\newcounter{slide}
\newbox\nicrainha@body
\newenvironment{slide}[1]{%
  \clearpage
  \stepcounter{slide}%
  \gdef\nicrainha@title{#1}%
  \if\relax\detokenize{#1}\relax\else\nicrainha@glass{title banner}\fi
  \setbox\nicrainha@body\vbox\bgroup
    \hsize\textwidth
    \linewidth\hsize
    \@parboxrestore
    \parskip0.5\baselineskip
}{%
  \par\egroup
  \setbox\nicrainha@body\vbox to\textheight{\vfil\unvbox\nicrainha@body\vfil}%
  \ifnum\badness>\@M
    \ClassWarningNoLine{nicrainha}{Slide \theslide\space doesn't fit: see the
      Overfull \string\vbox\space above}%
  \fi
  \box\nicrainha@body
  \clearpage}

% A bibliography's heading is its slide's title: article's own heading, a
% \section*, is dropped.
\AddToHook{env/thebibliography/begin}{\renewcommand\section{\@ifstar\@gobble\@gobble}}

% Figures and tables stay where they are: a slide has nowhere to float them.
\renewenvironment{figure}[1][]{\par\centering\def\@captype{figure}}{\par}
\renewenvironment{table}[1][]{\par\centering\def\@captype{table}}{\par}

% The title slide: the title, author and date, centered on the page, as
% wide as their widest line. The showcase puts glass behind them reaching a
% margin past them, so the class logs their size: "… has a title card
% <width> <height>". They wrap a margin narrower than the text, so that glass
% is no wider than a banner. A title too tall for the page is TeX's overfull
% \vbox.
\newlength\nicrainha@widest
\renewcommand\maketitle{%
  \clearpage
  \gdef\nicrainha@title{}%
  \setbox\nicrainha@body\vbox{%
    \hsize\dimexpr\textwidth-\nicrainha@margin\relax
    \linewidth\hsize
    \@parboxrestore
    \centering
    {\LARGE\bfseries\@title\par}%
    \vskip1em
    {\large\@author\par}%
    \vskip0.5em
    {\@date\par}}%
  \setbox\@tempboxa\vbox{\unvcopy\nicrainha@body\global\nicrainha@widest\z@\nicrainha@lines}%
  % A full line's spaces may shrink: its natural width can pass the box's.
  \ifdim\nicrainha@widest>\wd\nicrainha@body \nicrainha@widest\wd\nicrainha@body \fi
  \nicrainha@glass{title card \the\nicrainha@widest\space
    \the\dimexpr\ht\nicrainha@body+\dp\nicrainha@body\relax}%
  % Centered on the page: the text area starts below the strip and ends above
  % the bottom margin, so the space under the title makes up the difference.
  \setbox\nicrainha@body\vbox to\textheight{\vfil
    \hbox to\textwidth{\hfil{\color{black}\box\nicrainha@body}\hfil}%
    \vfil
    \vskip\dimexpr\nicrainha@strip-\nicrainha@margin\relax}%
  \ifnum\badness>\@M
    \ClassWarningNoLine{nicrainha}{The title doesn't fit: see the Overfull
      \string\vbox\space above}%
  \fi
  \box\nicrainha@body
  \clearpage}

% Takes a vertical list apart from its end, leaving \nicrainha@widest the
% natural width of its widest line: a line's material without the glue that
% centers it, which stretches from nothing.
\def\nicrainha@lines{%
  \ifcase\numexpr\lastnodetype+1\relax
  \or\or
    \setbox\z@\lastbox
    \setbox\z@\hbox{\unhbox\z@}%
    \ifdim\wd\z@>\nicrainha@widest \global\nicrainha@widest\wd\z@\fi
    \expandafter\nicrainha@lines
  \or\or\or\or\or\or\or\or\or\or
    \unskip\expandafter\nicrainha@lines
  \or
    \unkern\expandafter\nicrainha@lines
  \or
    \unpenalty\expandafter\nicrainha@lines
  \fi}
